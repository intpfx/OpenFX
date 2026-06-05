import { expect } from "@std/expect";

import { parseTophubHtml } from "../hotlist-crawler.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * 构造模拟 tophub.today HTML 片段。
 *
 * 结构:
 *   .cc-cd          — 每个热榜类目容器
 *     .cc-cd-lb     — 类目标题
 *     .cc-cd-cb-l   — 类目内容区
 *       a            — 每条热榜链接
 *         .t / .tt  — 标题
 */
function buildTophubHtml(
  categories: Array<{
    title: string;
    items: Array<{ title: string; href: string }>;
  }>,
): string {
  const blocks: string[] = [];

  for (const cat of categories) {
    let block = `<div class="cc-cd">`;
    block += `<div class="cc-cd-lb">${cat.title}</div>`;
    block += `<div class="cc-cd-cb-l">`;
    for (const item of cat.items) {
      block +=
        `<a href="${item.href}" target="_blank"><span class="t">${item.title}</span></a>`;
    }
    block += `</div>`;
    block += `</div>`;
    blocks.push(block);
  }

  return blocks.join("\n");
}

/** 标准测试数据 */
const SAMPLE_ITEMS_ZHIHU = [
  { title: "如何看待xxx事件", href: "https://tophub.today/redirect?url=zhihu1" },
  { title: "为什么xxx这么火", href: "https://tophub.today/redirect?url=zhihu2" },
  { title: "如何评价xxx", href: "https://tophub.today/redirect?url=zhihu3" },
];

const SAMPLE_ITEMS_WEIBO = [
  { title: "热搜第一", href: "https://tophub.today/redirect?url=weibo1" },
  { title: "热搜第二", href: "https://tophub.today/redirect?url=weibo2" },
];

const SAMPLE_CATEGORIES = [
  { title: "知乎", items: SAMPLE_ITEMS_ZHIHU },
  { title: "微博", items: SAMPLE_ITEMS_WEIBO },
];

// ─── parseTophubHtml ──────────────────────────────────────────────────────────

Deno.test("parseTophubHtml: parses multiple categories correctly", () => {
  const html = buildTophubHtml(SAMPLE_CATEGORIES);
  const result = parseTophubHtml(html);

  expect(result.length).toBe(2);

  expect(result[0].title).toBe("知乎");
  expect(result[0].links.length).toBe(3);
  expect(result[0].links[0].title).toBe("如何看待xxx事件");
  expect(result[0].links[0].href).toContain("zhihu1");

  expect(result[1].title).toBe("微博");
  expect(result[1].links.length).toBe(2);
  expect(result[1].links[1].title).toBe("热搜第二");
});

Deno.test("parseTophubHtml: single category with single item", () => {
  const html = buildTophubHtml([
    { title: "测试", items: [{ title: "唯一条目", href: "/test" }] },
  ]);
  const result = parseTophubHtml(html);

  expect(result.length).toBe(1);
  expect(result[0].title).toBe("测试");
  expect(result[0].links.length).toBe(1);
  expect(result[0].links[0].title).toBe("唯一条目");
  expect(result[0].links[0].href).toBe("/test");
});

Deno.test("parseTophubHtml: handles category with many items", () => {
  const items = Array.from({ length: 50 }, (_, i) => ({
    title: `热榜条目 ${i + 1}`,
    href: `/item/${i + 1}`,
  }));
  const html = buildTophubHtml([{ title: "综合", items }]);
  const result = parseTophubHtml(html);

  expect(result.length).toBe(1);
  expect(result[0].links.length).toBe(50);
  expect(result[0].links[0].title).toBe("热榜条目 1");
  expect(result[0].links[49].title).toBe("热榜条目 50");
});

Deno.test("parseTophubHtml: empty HTML returns empty array", () => {
  const result = parseTophubHtml("");
  expect(result).toEqual([]);
});

Deno.test("parseTophubHtml: HTML without cc-cd blocks returns empty array", () => {
  const html = "<html><body><div>No hotlist here</div></body></html>";
  const result = parseTophubHtml(html);
  expect(result).toEqual([]);
});

Deno.test("parseTophubHtml: HTML missing cc-cd-cb-l content returns category with no links", () => {
  // 有 cc-cd 但没有 cc-cd-cb-l → links 为空，该分类被跳过
  const html = `<div class="cc-cd"><div class="cc-cd-lb">空分类</div></div>`;
  const result = parseTophubHtml(html);
  expect(result).toEqual([]);
});

Deno.test("parseTophubHtml: category without links is excluded", () => {
  // cc-cd-cb-l 存在但没有 a 标签
  const html = `<div class="cc-cd">
<div class="cc-cd-lb">无链接</div>
<div class="cc-cd-cb-l">无内容</div>
</div>`;
  const result = parseTophubHtml(html);
  expect(result).toEqual([]);
});

Deno.test("parseTophubHtml: handles <a> tags without inner .t / .tt span", () => {
  // a 标签内直接放文本，没有 .t 或 .tt span
  const html = `<div class="cc-cd">
<div class="cc-cd-lb">直接文本</div>
<div class="cc-cd-cb-l">
<a href="/item1">直接标题1</a>
<a href="/item2">直接标题2</a>
</div>
</div>`;
  const result = parseTophubHtml(html);

  expect(result.length).toBe(1);
  expect(result[0].title).toBe("直接文本");
  expect(result[0].links[0].title).toBe("直接标题1");
  expect(result[0].links[1].title).toBe("直接标题2");
});

Deno.test("parseTophubHtml: handles .tt class for title", () => {
  // 使用 .tt 而不是 .t 作为标题容器
  const html = `<div class="cc-cd">
<div class="cc-cd-lb">TT测试</div>
<div class="cc-cd-cb-l">
<a href="/tt1"><span class="tt">标题A</span></a>
<a href="/tt2"><span class="tt">标题B</span></a>
</div>
</div>`;
  const result = parseTophubHtml(html);

  expect(result.length).toBe(1);
  expect(result[0].links[0].title).toBe("标题A");
  expect(result[0].links[1].title).toBe("标题B");
});

Deno.test("parseTophubHtml: handles .t class for title", () => {
  // 使用 .t 作为标题容器
  const html = `<div class="cc-cd">
<div class="cc-cd-lb">T测试</div>
<div class="cc-cd-cb-l">
<a href="/t1"><span class="t">条目1</span></a>
<a href="/t2"><span class="t">条目2</span></a>
</div>
</div>`;
  const result = parseTophubHtml(html);

  expect(result.length).toBe(1);
  expect(result[0].links[0].title).toBe("条目1");
  expect(result[0].links[1].title).toBe("条目2");
});

Deno.test("parseTophubHtml: strips HTML tags inside link titles", () => {
  // 标题内可能有其他标签，但 as-is regex 在 <span class="t"> 内遇到嵌套标签时会
  // 提前终止（到第一个 </ 就停）。这里验证标签剥离能力。
  // 使用非嵌套标签场景：span 外有装饰标签
  const html = `<div class="cc-cd">
<div class="cc-cd-lb">标签测试</div>
<div class="cc-cd-cb-l">
<a href="/tag1"><em><span class="t">强调标题</span></em></a>
</div>
</div>`;
  const result = parseTophubHtml(html);

  expect(result.length).toBe(1);
  expect(result[0].links[0].title).toBe("强调标题");
});

Deno.test("parseTophubHtml: handles mixed .t and .tt in same category", () => {
  const html = `<div class="cc-cd">
<div class="cc-cd-lb">混合</div>
<div class="cc-cd-cb-l">
<a href="/a"><span class="t">T标题</span></a>
<a href="/b"><span class="tt">TT标题</span></a>
</div>
</div>`;
  const result = parseTophubHtml(html);

  expect(result.length).toBe(1);
  expect(result[0].links[0].title).toBe("T标题");
  expect(result[0].links[1].title).toBe("TT标题");
});

Deno.test("parseTophubHtml: handles special characters in titles", () => {
  const html = buildTophubHtml([
    {
      title: "特殊字符",
      items: [
        { title: "价格 < 100 元", href: "/price" },
        { title: "A & B 的关系", href: "/relation" },
        { title: '"引用"内容', href: "/quote" },
      ],
    },
  ]);
  const result = parseTophubHtml(html);

  expect(result.length).toBe(1);
  expect(result[0].links[0].title).toBe("价格 < 100 元");
  expect(result[0].links[1].title).toBe("A & B 的关系");
});

Deno.test("parseTophubHtml: handles Chinese characters in titles and categories", () => {
  const html = buildTophubHtml([
    {
      title: "知乎热榜",
      items: [
        { title: "如何学习 TypeScript？", href: "/ts" },
        { title: "Deno 和 Node.js 的区别", href: "/deno" },
      ],
    },
    {
      title: "百度热搜",
      items: [
        { title: "今日天气", href: "/weather" },
      ],
    },
  ]);
  const result = parseTophubHtml(html);

  expect(result.length).toBe(2);
  expect(result[0].title).toBe("知乎热榜");
  expect(result[0].links[0].title).toBe("如何学习 TypeScript？");
  expect(result[1].title).toBe("百度热搜");
  expect(result[1].links[0].title).toBe("今日天气");
});

Deno.test("parseTophubHtml: skips empty-title links", () => {
  // 标题为空或只有空白的链接应被跳过
  const html = `<div class="cc-cd">
<div class="cc-cd-lb">测试</div>
<div class="cc-cd-cb-l">
<a href="/a"><span class="t">有效</span></a>
<a href="/b"><span class="t"> </span></a>
<a href="/c"><span class="t"></span></a>
<a href="/d"><span class="t">也有效</span></a>
</div>
</div>`;
  const result = parseTophubHtml(html);

  expect(result.length).toBe(1);
  // 空标题的链接被跳过
  expect(result[0].links.length).toBe(2);
  expect(result[0].links[0].title).toBe("有效");
  expect(result[0].links[1].title).toBe("也有效");
});

Deno.test("parseTophubHtml: preserves relative and absolute hrefs", () => {
  const html = buildTophubHtml([
    {
      title: "链接测试",
      items: [
        { title: "相对路径", href: "/relative/path" },
        { title: "绝对路径", href: "https://example.com/absolute" },
        { title: "协议相对", href: "//cdn.example.com/resource" },
      ],
    },
  ]);
  const result = parseTophubHtml(html);

  expect(result[0].links[0].href).toBe("/relative/path");
  expect(result[0].links[1].href).toBe("https://example.com/absolute");
  expect(result[0].links[2].href).toBe("//cdn.example.com/resource");
});

Deno.test("parseTophubHtml: large realistic tophub page", () => {
  const categories = [
    {
      title: "知乎",
      items: Array.from({ length: 20 }, (_, i) => ({
        title: `知乎热榜第 ${i + 1} 名`,
        href: `/zhihu/${i + 1}`,
      })),
    },
    {
      title: "微博",
      items: Array.from({ length: 15 }, (_, i) => ({
        title: `微博热搜 ${i + 1}`,
        href: `/weibo/${i + 1}`,
      })),
    },
    {
      title: "百度",
      items: Array.from({ length: 10 }, (_, i) => ({
        title: `百度第 ${i + 1} 条`,
        href: `/baidu/${i + 1}`,
      })),
    },
    {
      title: "GitHub",
      items: Array.from({ length: 5 }, (_, i) => ({
        title: `trending-repo-${i + 1}`,
        href: `/github/${i + 1}`,
      })),
    },
  ];
  const html = buildTophubHtml(categories);
  const result = parseTophubHtml(html);

  expect(result.length).toBe(4);
  expect(result[0].links.length).toBe(20);
  expect(result[1].links.length).toBe(15);
  expect(result[2].links.length).toBe(10);
  expect(result[3].links.length).toBe(5);
});

// ─── Structure integrity ─────────────────────────────────────────────────────

Deno.test("parseTophubHtml: each returned link has title and href strings", () => {
  const html = buildTophubHtml(SAMPLE_CATEGORIES);
  const result = parseTophubHtml(html);

  for (const cat of result) {
    expect(typeof cat.title).toBe("string");
    expect(cat.title.length).toBeGreaterThan(0);
    for (const link of cat.links) {
      expect(typeof link.title).toBe("string");
      expect(link.title.length).toBeGreaterThan(0);
      expect(typeof link.href).toBe("string");
      expect(link.href.length).toBeGreaterThan(0);
    }
  }
});

Deno.test("parseTophubHtml: category titles are stripped of HTML", () => {
  const html = `<div class="cc-cd">
<div class="cc-cd-lb"><span>包装标题</span></div>
<div class="cc-cd-cb-l">
<a href="/a"><span class="t">条目</span></a>
</div>
</div>`;
  const result = parseTophubHtml(html);

  expect(result.length).toBe(1);
  expect(result[0].title).toBe("包装标题");
});

Deno.test("parseTophubHtml: handles multiple cc-cd blocks with interleaving HTML", () => {
  const html = `
<div class="cc-cd">
<div class="cc-cd-lb">分类A</div>
<div class="cc-cd-cb-l">
<a href="/a1"><span class="t">A1</span></a>
</div>
</div>
<!-- 广告区 -->
<div class="ad">广告内容</div>
<div class="cc-cd">
<div class="cc-cd-lb">分类B</div>
<div class="cc-cd-cb-l">
<a href="/b1"><span class="t">B1</span></a>
<a href="/b2"><span class="t">B2</span></a>
</div>
</div>`;
  const result = parseTophubHtml(html);

  expect(result.length).toBe(2);
  expect(result[0].title).toBe("分类A");
  expect(result[1].title).toBe("分类B");
  expect(result[1].links.length).toBe(2);
});
