# CSS 冲突诊断脚本 & Google Fonts 阻断日志

## 快速验证当前页面 CSS 冲突状态

在 browser_eval 中执行（bb-browser 或 DevTools console）：

```js
JSON.stringify(
  {
    htmlBgColor: getComputedStyle(document.documentElement).backgroundColor,
    bodyBgImage: getComputedStyle(document.body).backgroundImage,
    bodyBgSize: getComputedStyle(document.body).backgroundSize,
    htmlFontFamily: getComputedStyle(document.documentElement).fontFamily,
    htmlColorScheme: getComputedStyle(document.documentElement).colorScheme,
    styleTagCount: document.querySelectorAll("style").length,
    styleTags: [...document.querySelectorAll("style")].map((s) => ({
      len: s.textContent.length,
      hasNonce: s.hasAttribute("nonce"),
      viteDevId: s.getAttribute("data-vite-dev-id") || "(none)",
      preview: s.textContent.substring(0, 100),
    })),
    interCount: [...document.querySelectorAll("*")].filter(
      (el) => getComputedStyle(el).fontFamily.includes("Inter"),
    ).length,
  },
  null,
  2,
);
```

预期结果（正确时）：

- `htmlBgColor`: `"oklch(0.985 0.002 250)"`
- `bodyBgImage`: 包含 `linear-gradient` 网格
- `bodyBgSize`: `"80px 80px"`（关键：不是 `"auto, auto"`）
- `htmlFontFamily`: 不含 `"Inter"`
- `htmlColorScheme`: 不含 `"dark"`
- `styleTagCount`: 2（SSR 内联 + Vite CSS）而非 3+
- `interCount`: 0

## Google Fonts 网络诊断

在 browser_network 结果中搜索：

```
fonts.gstatic.com
```

**正常状态**：字体请求 status 200，mimeType `font/woff2` **阻断状态**：

```
failed: true
failureReason: "net::ERR_CONNECTION_CLOSED"
```

阻断原因：Clash Verge Rev TUN 模式 fake-IP 范围 `198.18.0.1/30` 的规则可能阻断了
`fonts.gstatic.com`。

### 排查命令（macOS）

```bash
# 检查 Clash 日志中是否有 fonts.gstatic.com 相关记录
tail -f ~/Library/Application\ Support/io.github.clash-verge-rev.clash-verge-rev/logs/*.log | grep -i gstatic

# 测试直连
curl -I https://fonts.gstatic.com/

# 查看当前代理规则中是否包含 gstatic
# （在 Clash Verge Rev Web UI: 127.0.0.1:33331 检查 Rules 标签页）
```

## 多 dev server 实例检测

```bash
# 检查端口占用
lsof -i :5173 2>/dev/null | grep LISTEN

# 检查所有 deno task web:dev 进程
ps aux | grep 'deno task.*web:dev' | grep -v grep

# 清理多余实例
kill <多余PID>
```

## `background` shorthand `!important` footgun 速查

问题代码：

```css
/* ❌ 错误：shorthand + !important 吃掉 background-size */
html, body {
  background: var(--bg) !important; /* 包含 background-size: initial !important */
  background-size: 80px 80px; /* 无效！被上一行 !important 覆盖 */
}
```

正确写法：

```css
/* ✅ 正确：只用需要的子属性 + !important */
html, body {
  background-color: var(--bg) !important;
  background-image:  /* grid */ !important;
  background-size: 80px 80px; /* 正常生效 */
  background-position: -1px -1px;
}
```
