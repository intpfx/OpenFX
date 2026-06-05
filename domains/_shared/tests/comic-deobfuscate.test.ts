import { expect } from "@std/expect";

import { deobfuscateComicData, extractCleanBase64 } from "../comic-deobfuscate.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * 构造混淆后的 base64 字符串。
 *
 * 模拟腾讯动漫的混淆方案：在纯净 base64 中按 nonce 规则插入混淆字符。
 * nonce 格式: 多组 `\d+[a-zA-Z]+` 拼接，如 "3a4B5c"。
 * - 数字部分 = 插入位置
 * - 字母长度 = 插入的混淆字符数
 *
 * 规则按原始顺序正向插入（deobfuscate 内部反转后删除）。
 */
function obfuscateBase64(cleanBase64: string, nonce: string): string {
  const pattern = /\d+[a-zA-Z]+/g;
  const matches = nonce.match(pattern);
  if (!matches || matches.length === 0) return cleanBase64;

  const chars = Array.from(cleanBase64);
  for (const m of matches) {
    const digits = m.match(/\d+/)![0];
    const letters = m.replace(/\d+/g, "");
    const position = parseInt(digits, 10) & 255;
    const length = letters.length;
    const insertStr = "X".repeat(length);
    chars.splice(position, 0, ...Array.from(insertStr));
  }
  return chars.join("");
}

/**
 * 构造模拟的腾讯动漫 HTML 片段。
 *
 * 包含:
 *   var DATA = '混淆base64',
 *   第一处 window["nonce"] (诱饵 fake nonce)
 *   第二处 window["nonce"] (真正的 nonce)
 */
function buildComicHtml(
  obfuscatedData: string,
  realNonce: string,
  fakeNonce = "0a1B",
): string {
  return `<html>
<head><title>漫画章节</title></head>
<body>
<script>
var DATA = '${obfuscatedData}',
window["\\x6e\\x6f\\x6e\\x63\\x65"] = "${fakeNonce}";
window["\\x6e\\x6f\\x6e\\x63\\x65"] = "${realNonce}";
</script>
</body>
</html>`;
}

/** 测试用漫画 JSON 数据 */
const SAMPLE_COMIC_JSON = {
  comic: { title: "测试漫画", id: "12345" },
  chapter: { cTitle: "第一章", cid: "67890" },
  picture: [
    { url: "https://example.com/1.jpg", width: 800 },
    { url: "https://example.com/2.jpg", width: 800 },
  ],
};

/** 将 JSON 对象转为纯净 base64 字符串 */
function jsonToBase64(obj: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}

// ─── deobfuscateComicData ─────────────────────────────────────────────────────

Deno.test("deobfuscateComicData: roundtrip with single nonce rule", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  const nonce = "3a";
  const obfuscated = obfuscateBase64(cleanBase64, nonce);
  const html = buildComicHtml(obfuscated, nonce);

  const result = deobfuscateComicData(html);

  expect(result.comic.title).toBe("测试漫画");
  expect(result.comic.id).toBe("12345");
  expect(result.chapter.cTitle).toBe("第一章");
  expect(result.chapter.cid).toBe("67890");
  expect(result.picture.length).toBe(2);
  expect(result.picture[0].url).toBe("https://example.com/1.jpg");
});

Deno.test("deobfuscateComicData: roundtrip with multiple nonce rules", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  const nonce = "2a5B7c"; // pos:2 len:1, pos:5 len:2, pos:7 len:1
  const obfuscated = obfuscateBase64(cleanBase64, nonce);
  const html = buildComicHtml(obfuscated, nonce);

  const result = deobfuscateComicData(html);

  expect(result.comic.title).toBe("测试漫画");
  expect(result.chapter.cTitle).toBe("第一章");
  expect(result.picture).toHaveLength(2);
});

Deno.test("deobfuscateComicData: roundtrip with many nonce rules", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  // 多个规则覆盖不同位置
  const nonce = "1c3D5e7F9g11ho"; // 每个规则插入1-2个混淆字符
  const obfuscated = obfuscateBase64(cleanBase64, nonce);
  const html = buildComicHtml(obfuscated, nonce);

  const result = deobfuscateComicData(html);

  expect(result.comic.title).toBe("测试漫画");
  expect(result.picture).toHaveLength(2);
});

Deno.test("deobfuscateComicData: roundtrip with rules at high positions", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  // 在靠后位置插入混淆字符
  const nonce = "50ab100CD";
  const obfuscated = obfuscateBase64(cleanBase64, nonce);
  const html = buildComicHtml(obfuscated, nonce);

  const result = deobfuscateComicData(html);

  expect(result.comic.title).toBe("测试漫画");
});

Deno.test("deobfuscateComicData: roundtrip with zero-length nonce (no obfuscation)", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  // 空 nonce 表示无混淆
  const nonce = ""; // 无有效规则
  const html = buildComicHtml(cleanBase64, nonce);

  const result = deobfuscateComicData(html);

  expect(result.comic.title).toBe("测试漫画");
});

Deno.test("deobfuscateComicData: handles non-ASCII characters in JSON", () => {
  const data = {
    comic: { title: "ワンピース" },
    chapter: { cTitle: "第1話" },
    picture: [{ url: "https://example.com/画像.jpg" }],
  };
  const cleanBase64 = jsonToBase64(data);
  const nonce = "4a8B";
  const obfuscated = obfuscateBase64(cleanBase64, nonce);
  const html = buildComicHtml(obfuscated, nonce);

  const result = deobfuscateComicData(html);

  expect(result.comic.title).toBe("ワンピース");
  expect(result.picture[0].url).toBe("https://example.com/画像.jpg");
});

Deno.test("deobfuscateComicData: handles empty picture array", () => {
  const data = {
    comic: { title: "Test" },
    chapter: { cTitle: "Ch1" },
    picture: [] as Array<{ url: string }>,
  };
  const cleanBase64 = jsonToBase64(data);
  const nonce = "1c";
  const obfuscated = obfuscateBase64(cleanBase64, nonce);
  const html = buildComicHtml(obfuscated, nonce);

  const result = deobfuscateComicData(html);

  expect(result.picture).toEqual([]);
});

// ─── Error cases ──────────────────────────────────────────────────────────────

Deno.test("deobfuscateComicData: throws when var DATA is missing", () => {
  const html =
    `<html><body><script>window["nonce"] = "fake"; window["nonce"] = "3a";</script></body></html>`;

  expect(() => deobfuscateComicData(html)).toThrow("未找到 var DATA 声明");
});

Deno.test("deobfuscateComicData: throws when window declarations are missing", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  const html =
    `<html><body><script>var DATA = '${cleanBase64}',</script></body></html>`;

  expect(() => deobfuscateComicData(html)).toThrow("未找到 window 声明");
});

Deno.test("deobfuscateComicData: throws with only one window declaration (missing real nonce)", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  const html =
    `<html><body><script>var DATA = '${cleanBase64}', window["nonce"] = "fake";</script></body></html>`;

  expect(() => deobfuscateComicData(html)).toThrow("未找到 nonce window 声明");
});

Deno.test("deobfuscateComicData: throws when DATA value has no comma terminator", () => {
  // 缺少逗号结束符导致无法定位 DATA 值结束
  const html =
    `<html><body><script>var DATA = 'someBase64' window["nonce"] = "x"; window["nonce"] = "3a";</script></body></html>`;

  expect(() => deobfuscateComicData(html)).toThrow();
});

Deno.test("deobfuscateComicData: throws on invalid base64 / JSON after deobfuscation", () => {
  // 构造一个数据，nonce 规则与实际混淆不匹配，导致 base64 解码后 JSON 无效
  const fakeBase64 = "!!!!not-valid-base64!!!!";
  const html = buildComicHtml(fakeBase64, "0a");

  expect(() => deobfuscateComicData(html)).toThrow();
});

// ─── extractCleanBase64 ───────────────────────────────────────────────────────

Deno.test("extractCleanBase64: returns clean base64 matching original", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  const nonce = "2a5B7c";
  const obfuscated = obfuscateBase64(cleanBase64, nonce);
  const html = buildComicHtml(obfuscated, nonce);

  const result = extractCleanBase64(html);

  expect(result).toBe(cleanBase64);
});

Deno.test("extractCleanBase64: returns same base64 for different nonce values", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);

  // 两个不同的 nonce 混淆同一数据
  const nonce1 = "3a7B";
  const obfuscated1 = obfuscateBase64(cleanBase64, nonce1);
  const html1 = buildComicHtml(obfuscated1, nonce1);

  const nonce2 = "1c5D9e";
  const obfuscated2 = obfuscateBase64(cleanBase64, nonce2);
  const html2 = buildComicHtml(obfuscated2, nonce2);

  const result1 = extractCleanBase64(html1);
  const result2 = extractCleanBase64(html2);

  expect(result1).toBe(cleanBase64);
  expect(result2).toBe(cleanBase64);
  expect(result1).toBe(result2);
});

Deno.test("extractCleanBase64: empty nonce returns original DATA", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  const html = buildComicHtml(cleanBase64, "");

  const result = extractCleanBase64(html);

  expect(result).toBe(cleanBase64);
});

Deno.test("extractCleanBase64: can be decoded back to valid JSON", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  const nonce = "4a6B";
  const obfuscated = obfuscateBase64(cleanBase64, nonce);
  const html = buildComicHtml(obfuscated, nonce);

  const result = extractCleanBase64(html);

  // 使用与 deobfuscateComicData 相同的解码路径验证：
  // btoa(unescape(encodeURIComponent(s))) 的反向操作
  const bytes = Uint8Array.from(atob(result), (c) => c.charCodeAt(0));
  const decodedStr = new TextDecoder().decode(bytes);
  const decoded = JSON.parse(decodedStr);
  expect(decoded.comic.title).toBe("测试漫画");
});

Deno.test("extractCleanBase64: different obfuscation of same base64 yields same clean result", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);

  // 第一个混淆方案
  const nonce1 = "5a";
  const obfuscated1 = obfuscateBase64(cleanBase64, nonce1);

  // 第二个混淆方案：两次混淆后分别用对应 nonce 清除
  const nonce2 = "10CD";
  const obfuscated2 = obfuscateBase64(cleanBase64, nonce2);

  const result1 = extractCleanBase64(buildComicHtml(obfuscated1, nonce1));
  const result2 = extractCleanBase64(buildComicHtml(obfuscated2, nonce2));

  expect(result1).toBe(cleanBase64);
  expect(result2).toBe(cleanBase64);
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

Deno.test("deobfuscateComicData: handles nonce with very long letter sequences", () => {
  const data = { comic: { title: "A" }, chapter: { cTitle: "B" }, picture: [] };
  const cleanBase64 = jsonToBase64(data);
  // 单个规则删除 10 个字符
  const nonce = "0abcdefghij"; // pos:0, len:10
  const obfuscated = obfuscateBase64(cleanBase64, nonce);
  const html = buildComicHtml(obfuscated, nonce);

  const result = deobfuscateComicData(html);

  expect(result.comic.title).toBe("A");
});

Deno.test("deobfuscateComicData: handles nonce with position exceeding 255 (mod 256)", () => {
  const data = { comic: { title: "Test" }, chapter: { cTitle: "Ch" }, picture: [] };
  const cleanBase64 = jsonToBase64(data);
  // pos = 258 → 258 & 255 = 2
  const nonce = "258a"; // 实际位置是 2
  const obfuscated = obfuscateBase64(cleanBase64, "2a"); // 用位置 2 构造
  const html = buildComicHtml(obfuscated, nonce);

  const result = deobfuscateComicData(html);

  expect(result.comic.title).toBe("Test");
});

Deno.test("deobfuscateComicData: handles DATA with single-quote delimiters", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  const nonce = "3a";
  const obfuscated = obfuscateBase64(cleanBase64, nonce);

  // 使用单引号 DATA
  const html = `<html><body><script>
var DATA = '${obfuscated}',
window["nonce"] = "fake";
window["nonce"] = "${nonce}";
</script></body></html>`;

  const result = deobfuscateComicData(html);
  expect(result.comic.title).toBe("测试漫画");
});

Deno.test("deobfuscateComicData: handles DATA with double-quote delimiters", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  const nonce = "3a";
  const obfuscated = obfuscateBase64(cleanBase64, nonce);

  // 使用双引号 DATA (JSON.parse 兼容的简单字符串)
  const html = `<html><body><script>
var DATA = "${obfuscated}",
window["nonce"] = "fake";
window["nonce"] = "${nonce}";
</script></body></html>`;

  const result = deobfuscateComicData(html);
  expect(result.comic.title).toBe("测试漫画");
});

Deno.test("deobfuscateComicData: correct nonce extracted when fake nonce differs", () => {
  const cleanBase64 = jsonToBase64(SAMPLE_COMIC_JSON);
  const realNonce = "5a8B";
  const obfuscated = obfuscateBase64(cleanBase64, realNonce);

  // 使用与 fakeNonce 默认值不同的 nonce
  const html = `<html><body><script>
var DATA = '${obfuscated}',
window["nonce"] = "999z999z999z";
window["nonce"] = "${realNonce}";
</script></body></html>`;

  const result = deobfuscateComicData(html);
  expect(result.comic.title).toBe("测试漫画");
});
