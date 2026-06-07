# BewlyScript.user.js

`dist/BewlyScript.user.js` 是从 BewlyCat WebExtension 源码构建出的单文件 userscript。

## 安装目标

- Safari：Userscripts app，要求脚本以 `.user.js` 形式安装，并使用 `@inject-into content` 以获得 GM API。
- Chrome/Edge/Firefox：Tampermonkey、Violentmonkey 或兼容油猴管理器。

## 构建

```bash
pnpm install --ignore-scripts
pnpm build:userscript
```

## 兼容层

- `webextension-polyfill` 在 userscript 构建中被 Vite alias 到 `src/userscript/browser-shim.ts`。
- `browser.storage.local` 映射到 GM value API，缺失时退回 `localStorage`。
- `browser.runtime.sendMessage` 映射到同进程 API dispatcher，复用上游 background API map。
- B 站 API 请求优先走 `GM.xmlHttpRequest` / `GM_xmlhttpRequest`，缺失时退回 `fetch`。
- 静态资源通过构建脚本内联到 `__BEWLYSCRIPT_RESOURCES__`，不依赖外部 `@resource`。

## 移动端策略

移动端以 `m.bilibili.com` 为第一目标：

- `m.bilibili.com/` 作为 BewlyScript 移动首页识别，可进入自有首页、番剧、收藏、历史、稍后再看、动态等页面。
- 移动视频、搜索、空间、动态原站页不强行替换正文，避免遮挡或破坏 B 站移动端关键内容。
- 不清空移动页面 DOM，不套用桌面站全局 `bewly-design` 样式。
- 移动端隐藏桌面 TopBar，只保留安全区内的底部 Dock 和设置入口。
- Dock 默认底部常显、可横向滚动；设置窗口在窄屏下降级为底部抽屉。
- 首页分类胶囊在移动端内联显示，不依赖桌面顶栏插槽。

桌面端继续复用 BewlyCat 原有页面与组件逻辑。

## 验证

```bash
pnpm check:userscript
deno task check
```

真机调试可通过 macOS Safari Web Inspector 连接 iPhone Safari。若需要通过 `xcrun devicectl`
启动页面、读取显示信息或做更深的设备级验证，iPhone 需要开启 Developer Mode。
