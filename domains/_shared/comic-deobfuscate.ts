/**
 * 腾讯动漫混淆数据解码模块
 *
 * 来源: hiverepo git 历史
 * 原始文件: modules/get_comic.js
 * 原始 commit: cede623 (restart) — Verses 0.9.x 时期
 * 仓库: https://github.com/... (hiverepo)
 *
 * 算法说明:
 * 腾讯动漫页面 (ac.qq.com) 将漫画章节数据以混淆形式内嵌在 HTML 中。
 * 混淆方案:
 *   1. HTML 中存在 `var DATA = '...'` 字段，内容为掺入混淆字符的 base64 字符串
 *   2. HTML 中存在 `window["nonce"] = "...nonce..."` 字段，nonce 指示了混淆字符的位置
 *   3. nonce 格式: 由多组 `\d+[a-zA-Z]+` 模式拼接而成，每组表示「在位置 N 删去 L 个字符」
 *      - 数字部分 = 位置索引 (mod 256)
 *      - 字母部分 = 需要删除的字符数（用字母串长度表示，不校验具体字符）
 *   4. 按 nonce 规则逐组删除混淆字符后，得到纯净 base64 字符串
 *   5. base64 解码 → UTF-8 字节 → JSON 解析，得到漫画数据
 *
 * 重构要点:
 * - 移除原代码中的 eval() 调用，改用字符串解析提取 nonce
 * - 移除 Deno 特定 API 和交互式 prompt 逻辑
 * - 纯函数式设计，仅暴露数据解码核心逻辑
 * - 完整的 TypeScript 类型注解
 */

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** nonce 中的一条删除规则 */
interface NonceRule {
  /** 删除起始位置（已对 256 取模） */
  position: number;
  /** 要删除的字符数 */
  length: number;
}

/** 腾讯动漫漫画章节的原始数据结构 */
export interface ComicChapterData {
  comic: {
    title: string;
    [key: string]: unknown;
  };
  chapter: {
    cTitle: string;
    [key: string]: unknown;
  };
  picture: Array<{
    url: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 内部工具函数
// ---------------------------------------------------------------------------

/**
 * 从 HTML 中提取 `var DATA = '...'` 的原始值（含引号）
 */
function extractDataRaw(html: string): string {
  const marker = "var DATA = ";
  const dataStart = html.indexOf(marker);
  if (dataStart === -1) {
    throw new Error("未找到 var DATA 声明");
  }
  const valueStart = dataStart + marker.length;
  const dataEnd = html.indexOf(",", valueStart);
  if (dataEnd === -1) {
    throw new Error("无法确定 DATA 值结束位置");
  }
  return html.slice(valueStart, dataEnd).trim();
}

/**
 * 安全地从字符串字面量提取值（避免 eval）
 *
 * 支持的格式:
 *   "simple string"
 *   'simple string'
 *   "\x48\x65\x6c\x6c\x6f"  (十六进制转义)
 */
function extractStringLiteral(raw: string): string {
  const trimmed = raw.trim();

  // 双引号字符串
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      // JSON.parse 失败时手动处理简单情况
      return trimmed.slice(1, -1);
    }
  }

  // 单引号字符串
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * 从 HTML 中提取第二个 `window["..."]` 赋值的 nonce 值
 *
 * 腾讯动漫页面结构中有两处 window["..."]:
 *   第一处是 fake nonce (诱饵)
 *   第二处才是真正的 nonce
 *
 * @returns nonce 字符串，如 "3a4B5c6D7e"
 */
function extractNonce(html: string): string {
  // 定位第一个 window[" (fake)
  const fakeStart = html.indexOf('window["');
  if (fakeStart === -1) {
    throw new Error("未找到 window 声明");
  }

  // 定位第二个 window[" (真正的 nonce)
  const nonceStart = html.indexOf('window["', fakeStart + 1);
  if (nonceStart === -1) {
    throw new Error("未找到 nonce window 声明");
  }

  // 找到该语句结束的分号
  const nonceEnd = html.indexOf(";", nonceStart);
  if (nonceEnd === -1) {
    throw new Error("无法确定 nonce 语句结束位置");
  }

  // 提取 = 右侧的字符串字面量
  const statement = html.slice(nonceStart, nonceEnd);
  const eqIndex = statement.indexOf("=");
  if (eqIndex === -1) {
    throw new Error("nonce 语句中未找到赋值符");
  }

  const valueRaw = statement.slice(eqIndex + 1).trim();
  return extractStringLiteral(valueRaw);
}

/**
 * 解析 nonce 字符串为删除规则列表
 *
 * nonce 格式: 多组 `\d+[a-zA-Z]+` 拼接，如 "3a4B5c6D7e"
 *   - "3a"   → 在位置 3 删除 1 个字符
 *   - "4B"   → 在位置 4 删除 1 个字符
 *   - "5c6D" → 但这里 `5c` 和 `6D` 是分开的
 *
 * 注意: 原算法按从后往前的顺序处理规则 (jlen 递减)
 *
 * @param nonce - nonce 字符串
 * @returns 删除规则数组（已按逆序排列，与原算法处理顺序一致）
 */
function parseNonceRules(nonce: string): NonceRule[] {
  const pattern = /\d+[a-zA-Z]+/g;
  const matches = nonce.match(pattern);
  if (!matches || matches.length === 0) {
    return [];
  }

  const rules: NonceRule[] = [];
  for (const m of matches) {
    const digits = m.match(/\d+/)![0];
    const letters = m.replace(/\d+/g, "");
    const position = parseInt(digits, 10) & 255;
    const length = letters.length;
    rules.push({ position, length });
  }

  // 原算法从后往前处理，这里反转以保持相同语义
  rules.reverse();
  return rules;
}

/**
 * 应用 nonce 规则：从字符数组中删除混淆字符
 *
 * 原算法: T.splice(jlocate, jstr.length)
 * 含义: 在位置 jlocate 删除 jstr.length 个字符
 *
 * @param chars - 原始 DATA 字符数组
 * @param rules - nonce 删除规则（已逆序）
 * @returns 清理后的字符数组
 */
function applyNonceRules(chars: string[], rules: NonceRule[]): string[] {
  const result = [...chars];
  for (const rule of rules) {
    // 仅在有效范围内删除
    if (rule.position < result.length) {
      result.splice(rule.position, rule.length);
    }
  }
  return result;
}

/**
 * 自定义 base64 解码为字节数组
 *
 * 使用与原始代码相同的算法（标准 base64 字母表），
 * 保留与原实现一致的解码行为。
 */
function base64DecodeToBytes(base64Str: string): Uint8Array {
  const KEY_STR = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  const bytes: number[] = [];
  let i = 0;

  while (i < base64Str.length) {
    const b = KEY_STR.indexOf(base64Str[i]);
    i += 1;
    const d = KEY_STR.indexOf(base64Str[i]);
    i += 1;
    const f = KEY_STR.indexOf(base64Str[i]);
    i += 1;
    const g = KEY_STR.indexOf(base64Str[i]);
    i += 1;

    const byte0 = (b << 2) | (d >> 4);
    const byte1 = ((d & 15) << 4) | (f >> 2);
    const byte2 = ((f & 3) << 6) | g;

    bytes.push(byte0);
    if (f !== 64) bytes.push(byte1); // 64 = '='
    if (g !== 64) bytes.push(byte2);
  }

  return new Uint8Array(bytes);
}

/**
 * 将字节数组解码为 UTF-8 字符串
 */
function bytesToString(bytes: Uint8Array): string {
  // 使用 TextDecoder 进行正确的 UTF-8 解码
  return new TextDecoder("utf-8").decode(bytes);
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 从腾讯动漫页面 HTML 中提取并解码混淆的漫画数据
 *
 * 完整流程:
 *   1. 提取 `var DATA = '...'` 中的混淆 base64 字符串
 *   2. 提取 `window["..."]` 中的 nonce 字符串
 *   3. 解析 nonce 获取删除规则
 *   4. 按规则从 DATA 中删除混淆字符
 *   5. base64 解码 → JSON 解析
 *
 * @param html - 腾讯动漫章节页面的完整 HTML 文本
 * @returns 解析后的漫画数据对象
 * @throws {Error} 当 HTML 中缺少必要字段或解析失败时抛出
 *
 * @example
 * ```ts
 * const response = await fetch('https://ac.qq.com/ComicView/index/id/.../cid/...');
 * const html = await response.text();
 * const data = deobfuscateComicData(html);
 * console.log(data.comic.title, data.chapter.cTitle);
 * for (const pic of data.picture) {
 *   console.log(pic.url);
 * }
 * ```
 */
export function deobfuscateComicData(html: string): ComicChapterData {
  // 1. 提取混淆的 DATA 字符串
  const dataRaw = extractDataRaw(html);
  const dataContent = extractStringLiteral(dataRaw);

  // 2. 提取 nonce
  const nonce = extractNonce(html);

  // 3. 解析 nonce 规则并应用
  const rules = parseNonceRules(nonce);
  const chars = Array.from(dataContent);
  const cleanChars = applyNonceRules(chars, rules);
  const cleanBase64 = cleanChars.join("");

  // 4. Base64 解码
  const bytes = base64DecodeToBytes(cleanBase64);
  const jsonStr = bytesToString(bytes);

  // 5. JSON 解析
  try {
    return JSON.parse(jsonStr) as ComicChapterData;
  } catch (err) {
    throw new Error(
      `漫画数据 JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * 仅提取并清理混淆的 base64 字符串（不解码为 JSON）
 *
 * 适用于需要自行处理原始 JSON 字符串的场景。
 *
 * @param html - 腾讯动漫章节页面的完整 HTML 文本
 * @returns 清理后的 base64 字符串
 */
export function extractCleanBase64(html: string): string {
  const dataRaw = extractDataRaw(html);
  const dataContent = extractStringLiteral(dataRaw);
  const nonce = extractNonce(html);
  const rules = parseNonceRules(nonce);
  const chars = Array.from(dataContent);
  const cleanChars = applyNonceRules(chars, rules);
  return cleanChars.join("");
}
