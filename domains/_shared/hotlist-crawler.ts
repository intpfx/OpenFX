/**
 * 多平台热榜聚合爬虫模块
 *
 * 来源: hiverepo git 历史
 * 原始文件: modules/craw.js
 * 原始 commit: cede623 (restart) — Verses 0.9.x 时期
 * 仓库: https://github.com/... (hiverepo)
 *
 * 数据源:
 *   1. tophub.today — 聚合热榜 (HTML 解析 + 内部 API)
 *   2. weibo.com — 微博热搜 (JSON API)
 *   3. zhihu.com — 知乎热榜 (JSON API)
 *
 * 重构要点:
 * - 移除 Deno 特定依赖 (jsr:@b-fuze/deno-dom)
 * - 移除对 DOMParser 的运行时导入，改为纯 HTML 字符串解析
 * - 纯函数式设计：数据获取与解析逻辑分离
 * - 完整的 TypeScript 类型注解
 */

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 热榜来源标识 */
export type HotlistSource = "tophub" | "tophub-daily" | "weibo" | "zhihu";

/** 单条热榜条目 */
export interface HotItem {
  /** 标题 / 热搜词 */
  title: string;
  /** 链接 URL */
  url: string;
  /** 可选的排名序号 (1-based) */
  rank?: number;
}

/** 单个来源的热榜查询结果 */
export interface HotlistResult {
  /** 来源标识 */
  source: HotlistSource;
  /** 来源显示名称 */
  sourceName: string;
  /** 热榜条目列表 */
  items: HotItem[];
}

/** fetchHotlist 的错误信息 */
export interface HotlistFetchError {
  /** 发生错误的来源 */
  source: HotlistSource;
  /** 错误消息 */
  message: string;
}

// ---------------------------------------------------------------------------
// 内部工具：HTML 文本解析
// ---------------------------------------------------------------------------

/**
 * 简单的 HTML 文本提取器 —— 从 HTML 字符串中用正则提取内容，
 * 避免引入 DOM 解析器依赖。
 */

/** 从 HTML 片段中提取所有 <a> 标签的文本和 href */
function _parseAnchorTags(html: string): Array<{ text: string; href: string }> {
  const results: Array<{ text: string; href: string }> = [];
  // 匹配 <a ...>text</a>，同时提取 href 和 inner text
  const regex = /<a[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    // 去除内部标签，保留纯文本
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text.length > 0) {
      results.push({ text, href });
    }
  }
  return results;
}

/**
 * 从 HTML 中提取所有具有指定 class 的元素文本
 * 使用简单正则匹配，适用于 tophub.today 的固定结构
 */
function _extractClassText(html: string, className: string): string[] {
  const results: string[] = [];
  // 匹配 class="className" 或 class='className' 的标签内容
  const regex = new RegExp(
    `class\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

// ---------------------------------------------------------------------------
// 源: tophub.today
// ---------------------------------------------------------------------------

/** tophub.today 热榜类目项 */
interface TophubCategory {
  /** 类目标题，如 "知乎"、"微博" */
  title: string;
  /** 该类目下的链接 */
  links: Array<{ title: string; href: string }>;
}

/**
 * 从 tophub.today HTML 中解析出各类目热榜
 *
 * tophub.today 首页结构:
 *   .cc-cd          — 每个热榜类目容器
 *     .cc-cd-lb     — 类目名称
 *     .cc-cd-cb-l   — 类目内容
 *       a            — 每条热榜链接
 *         .t / .tt  — 标题
 *
 * 此函数为纯解析函数，不涉及网络请求。
 *
 * @param html - tophub.today 首页 HTML
 * @returns 解析后的类目列表
 */
export function parseTophubHtml(html: string): TophubCategory[] {
  const categories: TophubCategory[] = [];

  // 按 .cc-cd 容器分割
  const blockRegex =
    /<div[^>]*class="cc-cd"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="cc-cd"|<!-- 尾|$)/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const block = blockMatch[1];

    // 提取类目标题 (.cc-cd-lb)
    const titleMatch = block.match(
      /<[^>]*class="cc-cd-lb"[^>]*>([\s\S]*?)<\//i,
    );
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Unknown";

    // 提取 .cc-cd-cb-l 内的所有链接
    const contentMatch = block.match(
      /<[^>]*class="cc-cd-cb-l[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const content = contentMatch ? contentMatch[1] : "";

    const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const links: Array<{ title: string; href: string }> = [];
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = linkRegex.exec(content)) !== null) {
      const href = linkMatch[1];
      // 提取 .t 或 .tt 内的文本
      const innerMatch = linkMatch[2].match(
        /<[^>]*class="(?:t|tt)"[^>]*>([\s\S]*?)<\//i,
      );
      const linkTitle = innerMatch
        ? innerMatch[1].replace(/<[^>]+>/g, "").trim()
        : linkMatch[2].replace(/<[^>]+>/g, "").trim();

      if (linkTitle.length > 0) {
        links.push({ title: linkTitle, href });
      }
    }

    if (links.length > 0) {
      categories.push({ title, links });
    }
  }

  return categories;
}

/**
 * 获取 tophub.today 首页热榜
 *
 * @returns 热榜结果
 */
export async function fetchTophubHotlist(): Promise<HotlistResult> {
  const response = await fetch("https://tophub.today/");
  if (!response.ok) {
    throw new Error(`tophub.today 请求失败: HTTP ${response.status}`);
  }
  const html = await response.text();
  const categories = parseTophubHtml(html);

  const items: HotItem[] = [];
  for (const cat of categories) {
    for (const link of cat.links) {
      items.push({
        title: `[${cat.title}] ${link.title}`,
        url: link.href,
      });
    }
  }

  return {
    source: "tophub",
    sourceName: "Tophub Today",
    items,
  };
}

/**
 * 获取 tophub.today 今日热榜 (内部 API)
 *
 * @returns 热榜结果
 */
export async function fetchTophubDailyHotlist(): Promise<HotlistResult> {
  const response = await fetch("https://tophub.today/do", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ c: "hot", t: "daily" }).toString(),
  });

  if (!response.ok) {
    throw new Error(`tophub.today API 请求失败: HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: Array<{ title: string; url: string }>;
    _error?: unknown;
    _status?: number;
  };

  if (json._error || !json.data) {
    throw new Error(`tophub.today API 返回错误: ${JSON.stringify(json._error)}`);
  }

  const items: HotItem[] = json.data.map((item, index) => ({
    title: item.title,
    url: item.url,
    rank: index + 1,
  }));

  return {
    source: "tophub-daily",
    sourceName: "Tophub 今日热榜",
    items,
  };
}

// ---------------------------------------------------------------------------
// 源: 微博热搜
// ---------------------------------------------------------------------------

/** 微博热搜 API 响应结构 */
interface WeiboHotSearchResponse {
  data?: {
    realtime?: Array<{
      word: string;
      word_scheme?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * 获取微博热搜榜
 *
 * 数据来源: https://weibo.com/ajax/side/hotSearch
 *
 * @returns 热榜结果
 */
export async function fetchWeiboHotlist(): Promise<HotlistResult> {
  const response = await fetch("https://weibo.com/ajax/side/hotSearch");

  if (!response.ok) {
    throw new Error(`微博 API 请求失败: HTTP ${response.status}`);
  }

  const json = (await response.json()) as WeiboHotSearchResponse;

  if (!json.data?.realtime) {
    throw new Error("微博 API 返回数据格式异常");
  }

  const items: HotItem[] = json.data.realtime.map((item, index) => ({
    title: item.word,
    url: item.word_scheme
      ? `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word)}`
      : `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word)}`,
    rank: index + 1,
  }));

  return {
    source: "weibo",
    sourceName: "微博热搜",
    items,
  };
}

// ---------------------------------------------------------------------------
// 源: 知乎热榜
// ---------------------------------------------------------------------------

/** 知乎热榜 API 响应结构 */
interface ZhihuHotResponse {
  data?: Array<{
    question: {
      title: string;
      url: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  paging?: unknown;
  [key: string]: unknown;
}

/**
 * 获取知乎热榜
 *
 * 数据来源: https://www.zhihu.com/api/v4/creators/rank/hot
 *
 * @returns 热榜结果
 */
export async function fetchZhihuHotlist(): Promise<HotlistResult> {
  const response = await fetch(
    "https://www.zhihu.com/api/v4/creators/rank/hot?domain=0&period=hour",
  );

  if (!response.ok) {
    throw new Error(`知乎 API 请求失败: HTTP ${response.status}`);
  }

  const json = (await response.json()) as ZhihuHotResponse;

  if (!json.data) {
    throw new Error("知乎 API 返回数据格式异常");
  }

  const items: HotItem[] = json.data.map((item, index) => ({
    title: item.question.title,
    url: item.question.url,
    rank: index + 1,
  }));

  return {
    source: "zhihu",
    sourceName: "知乎热榜",
    items,
  };
}

// ---------------------------------------------------------------------------
// 聚合入口
// ---------------------------------------------------------------------------

/** 各来源对应的抓取函数 */
const FETCHERS: Record<
  HotlistSource,
  () => Promise<HotlistResult>
> = {
  "tophub": fetchTophubHotlist,
  "tophub-daily": fetchTophubDailyHotlist,
  "weibo": fetchWeiboHotlist,
  "zhihu": fetchZhihuHotlist,
};

/** 各来源对应的显示名称 */
const _SOURCE_NAMES: Record<HotlistSource, string> = {
  "tophub": "Tophub Today",
  "tophub-daily": "Tophub 今日热榜",
  "weibo": "微博热搜",
  "zhihu": "知乎热榜",
};

/**
 * 聚合获取多个来源的热榜数据
 *
 * 并发请求所有指定来源，单个来源失败不影响其他来源。
 * 失败的来源会以错误信息形式包含在结果中。
 *
 * @param sources - 要查询的热榜来源列表，默认为所有来源
 * @returns 热榜结果列表和错误列表
 *
 * @example
 * ```ts
 * const { results, errors } = await fetchHotlist(['weibo', 'zhihu']);
 * for (const r of results) {
 *   console.log(`--- ${r.sourceName} ---`);
 *   for (const item of r.items) {
 *     console.log(`${item.rank}. ${item.title}`);
 *   }
 * }
 * ```
 */
export async function fetchHotlist(
  sources: HotlistSource[] = ["tophub", "weibo", "zhihu"],
): Promise<{
  results: HotlistResult[];
  errors: HotlistFetchError[];
}> {
  const results: HotlistResult[] = [];
  const errors: HotlistFetchError[] = [];

  const promises = sources.map(async (source) => {
    const fetcher = FETCHERS[source];
    if (!fetcher) {
      errors.push({ source, message: `未知来源: ${source}` });
      return;
    }
    try {
      const result = await fetcher();
      results.push(result);
    } catch (err) {
      errors.push({
        source,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await Promise.all(promises);

  return { results, errors };
}

/**
 * 遍历所有来源抓取热榜（包含 tophub-daily）
 *
 * @returns 热榜结果列表和错误列表
 */
export function crawlAllHotlists(): Promise<{
  results: HotlistResult[];
  errors: HotlistFetchError[];
}> {
  return fetchHotlist(["tophub", "tophub-daily", "weibo", "zhihu"]);
}
