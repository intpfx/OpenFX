# Fresh 组件架构参考 — OpenFX Web 首页

## 文件清单

```
apps/web/
├── routes/
│   ├── index.tsx              ← 首页（本参考主体）
│   └── downip.tsx             ← DownIP 页面（暗色主题，使用 AppShell）
├── islands/
│   ├── BrandToggle.tsx        ← FENGXIAO↔OpenFX 打字机动效
│   ├── ControlCluster.tsx     ← UNLOCK/MESSAGE 按钮 + Modal
│   ├── HiddenReveal.tsx       ← 解锁后 DOM 操作揭示隐藏卡片
│   ├── state.ts               ← Preact Signals 共享状态
│   └── Counter.tsx            ← 原项目 Counter island（未使用于首页）
├── components/
│   └── AppShell.tsx           ← 原项目通用布局（Dark 主题页用）
├── assets/
│   ├── homepage.css           ← 首页设计稿 CSS（内联到 index.tsx）
│   └── styles.css             ← 全局暗色主题（Vite 注入，所有页面）
├── static/
│   ├── homepage.html          ← [已废弃] 旧静态 HTML dump
│   └── homepage.css           ← [已废弃] 旧静态 CSS 文件
└── client.ts                  ← Vite 客户端入口，imports styles.css
```

## 组件树

```
<html lang="zh">
  <head>
    <meta charset/viewport>
    <title>FENGXIAO</title>
    <link> Google Fonts
    <style> 内联 homepage.css (13KB)
  </head>
  <body>
    <div class="page">
      <BrandToggle />          ← island: glitch animation
      <ControlCluster />       ← island: buttons + modals
      <div class="projects-zone">
        <div class="card-col-1"> OpenFX card (static) </div>
        <div class="card-col-2"> Project #2 + hidden1 (static + DOM) </div>
        <div class="card-col-3"> Project #3 + hidden2 + locked (static + DOM) </div>
      </div>
      <div class="footer"> (static) </div>
    </div>
    <HiddenReveal />           ← island: returns null, side-effects only
    <!-- Vite client bundle injected here -->
  </body>
</html>
```

## CSS 冲突与解决方案

### 问题

`client.ts` 中的 `import "./assets/styles.css"` 被 Vite 打包为 JS 注入的 `<style>`
标签，在页面加载后追加到 `<head>`。由于同名选择器按 DOM 顺序后者胜出，`styles.css`
的暗色主题覆盖了首页的浅色设计。

影响的选择器：

- `html, body { background, color }` — 暗色覆盖
- `body { background-image }` — 暗色渐变覆盖
- `.page { display, max-width, padding }` — 居中布局覆盖非对称 grid

### 验证方法

```js
getComputedStyle(document.body).backgroundColor;
// 错误: "rgb(7, 17, 31)" — styles.css wins
// 正确: "oklch(0.985 0.002 250)" — homepage.css wins
```

### 实际诊断结果（2026-05-16 浏览器实测）

以下是通过 `getComputedStyle()` + 网络请求日志验证的具体差异：

#### 背景：`background-size: 80px` 未生效

| 属性                  | 设计稿      | 实际 computed | 状态               |
| --------------------- | ----------- | ------------- | ------------------ |
| `background-size`     | `80px 80px` | `auto, auto`  | ❌                 |
| `background-position` | `-1px -1px` | 被覆盖        | ❌                 |
| `color-scheme`        | （无）      | `dark`        | ❌ 来自 styles.css |

**根因**：`background: var(--bg) !important` 是 CSS shorthand，包含
`background-size: initial !important`。后续的 `background-size: 80px 80px`（无
`!important`）被吃掉。

**正确写法**：只用 `background-color: var(--bg) !important`，不要用 shorthand
`background`。

#### 全局字体：Inter 泄漏

`computed htmlFontFamily: "Inter, ui-sans-serif, ..."` — 来自 styles.css 的
`:root { font-family: Inter, ... }`。

**根因**：`styles.css` 用 `:root` 选择器（= `html` 选择器，同优先级），通过 Vite JS
后注入（DOM 顺序后者胜）。`homepage.css` 的 `html, body { font-family: system-ui }` 无
`!important`，被覆盖。

#### 加载速度：Google Fonts 被代理阻断

网络日志显示：

```
fonts.gstatic.com/s/spacegrotesk/... → net::ERR_CONNECTION_CLOSED
fonts.gstatic.com/s/firacode/...     → net::ERR_CONNECTION_CLOSED
```

Clash Verge Rev TUN 模式（fake-IP
`198.18.0.1/30`）阻断了字体下载。浏览器等待超时，`loadComplete` 延迟至
10,124ms。真实浏览器中超时通常 30 秒以上。

### 推荐的正确修复（优先级排序）

| # | 修复                                                                            | 影响                                                         |
| - | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1 | `client.ts` 移除 `import "./assets/styles.css"`（DownIP 等暗色页面单独 import） | 根除所有 CSS 冲突，消除 Inter、color-scheme、重复 style 标签 |
| 2 | `background` shorthand → `background-color`，去掉不必要的 `!important`          | 恢复 `background-size: 80px` 和 `background-position`        |
| 3 | Google Fonts 自托管到 `apps/web/static/fonts/` 或排查 Clash 规则                | 消除 10s+ 字体加载超时                                       |
| 4 | `html { font-family: system-ui !important }`（若暂不删 styles.css）             | 临时止血 Inter 泄漏                                          |

### 备选方案评估（修订后）

| 方案                                     | 评估                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| 修改 `client.ts` 移除全局 styles.css     | ✅ **推荐**。只有 DownIP 页面需要暗色主题，改动小（1 行删除 + 1 行 import） |
| 给 homepage `<body>` 加 class + 高特异性 | ❌ 需要修改所有 homepage 的 CSS 选择器                                      |
| 用 `<script>` 在 body 末尾动态注入 CSS   | ❌ 闪烁问题                                                                 |
| `!important` workaround（当前方案）      | ⚠️ 临时可用但有 `background` shorthand 副作用，且不解决 `:root` 泄漏        |

## Island 通信：Preact Signals

### 模式

```ts
// islands/state.ts
import { signal } from "@preact/signals";
export const unlocked = signal(false);
```

两个 Island 各 import 同一模块。ES modules 在 Vite/Deno 中是单例——同一个 `signal` 实例。

```tsx
// ControlCluster.tsx
import { unlocked } from "./state.ts";
// 用户输入正确 key 后:
unlocked.value = true;
```

```tsx
// HiddenReveal.tsx
import { unlocked } from "./state.ts";
useSignalEffect(() => {
  if (unlocked.value) {
    // DOM 操作揭示卡片
    document.getElementById("hidden1")!.style.display = "flex";
    document.getElementById("lockedCard")!.style.display = "none";
  }
});
```

### 验证

```js
// 浏览器 console
document.getElementById("hidden1").style.display; // "flex" after unlock
document.getElementById("lockedCard").style.display; // "none" after unlock
```

## BrandToggle ↔ ControlCluster 按钮互斥\n\n设计稿要求 UNLOCK 和 MESSAGE 同时只显示一个：\n- FENGXIAO → 显示 MESSAGE\n- OpenFX → 显示 UNLOCK\n\n通过共享 `currentBrand` Signal 实现（`state.ts` 已定义）：\n\n`tsx\n// BrandToggle.tsx — 切换时写入共享 Signal\nimport { currentBrand } from \"./state.ts\";\n\nfunction finishAnim(w: string) {\n  // ...cleanup...\n  currentBrand.value = w as \"FENGXIAO\" | \"OpenFX\";\n}\n\nfunction toggle() {\n  const curWord = currentBrand.value;\n  const target = curWord === \"FENGXIAO\" ? \"OpenFX\" : \"FENGXIAO\";\n  currentBrand.value = target;  // 动画开始即切换，按钮立即响应\n  // ...animation timeline...\n}\n`\n\n`tsx\n// ControlCluster.tsx — 条件渲染按钮\nimport { currentBrand } from \"./state.ts\";\n\nreturn (\n  <div class=\"control-cluster\">\n    {currentBrand.value === \"OpenFX\" && (\n      <button class=\"ctrl-btn primary\" onClick={...}>UNLOCK</button>\n    )}\n    {currentBrand.value === \"FENGXIAO\" && (\n      <button class=\"ctrl-btn\" onClick={...}>MESSAGE</button>\n    )}\n  </div>\n);\n`\n\n注意：`currentBrand.value` 在 JSX 中被访问时会自动建立 Preact Signal 订阅——ControlCluster 会在 BrandToggle 更新 `currentBrand` 后自动重渲染。\n\n## BrandToggle 工作原理

1. 初始渲染 `setWord('FENGXIAO')`，每字符生成 `<span class="glitch-char">`
2. 锚点字符 O、F、X 在对应品牌中高亮 `color: var(--accent)`
3. `alignBrandBlock()` 通过计算锚点后缀 (XIAO/FX) 的 `getBoundingClientRect` 定位蓝色块
4. 点击触发 `toggle()`：
   - RGB split ghost 层激活
   - 构建 `timeline: {at, fn}[]` 数组
   - Timeline 循环：删除旧字符（右→左，带噪声）、插入新字符（带 enter 动画）
   - `finishAnim()` 收尾：清理 ghost、重建 span、重新 align block

动画由 `setTimeout(tick, 16)` 驱动，不是 `requestAnimationFrame`（bb-browser 不支持
rAF）。

## DownIP 页面

使用原始暗色主题，通过 `AppShell` 组件包裹。不加载 homepage.css 的浅色样式。

```tsx
// routes/downip.tsx
import { AppShell } from "@/components/AppShell.tsx";
export default function DownIPPage() {
  return <AppShell>...</AppShell>;
}
```

`AppShell` 只渲染 `<main class="page">`，样式由 `client.ts` 中 import 的 `styles.css`
控制。

## 已废弃的文件

- `static/homepage.html` — 旧的静态 HTML dump，已被 Fresh 组件替代
- `static/homepage.css` — 旧的静态 CSS 副本，CSS 现在内联到路由
