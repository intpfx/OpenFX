# BewlyScript

> BewlyCat 的 OpenFX 归档与 Userscripts/Tampermonkey 单文件构建。

## 并入 OpenFX

本 domain 以 `keleus/BewlyCat` 上游为基线，新增移动优先的 userscript 构建层：

- 上游仓库：`https://github.com/keleus/BewlyCat`
- 上游基线：`f8345485a884dfa83ef22a68cb8bd83eecfa4a48`（BewlyCat `v1.6.6`）
- 旧本地项目：`/Users/siaovon/Documents/Projects/BewlyScript`（已删除）
- 旧云端仓库：`https://github.com/intpfx/BewlyScript`（已删除）
- 并入时间：2026-06-06

旧 `BewlyScript` 是 `keleus/BewlyCat` 的公开 fork，停留在 `v1.4.2`，且本地有未提交的临时
userscript 产物。用户已确认直接硬删旧本地与云端项目，并以当前上游重新构建 OpenFX 内的
userscript 版本。

## 安装目标

- Safari：Userscripts app，要求脚本以 `.user.js` 形式安装，并使用 `@inject-into content` 以获得 GM API。
- Chrome/Edge/Firefox：Tampermonkey、Violentmonkey 或兼容油猴管理器。

## Userscript 构建

构建链路由 Bun 驱动，content/inject bundle 使用 VitePlus/Rolldown，最后由 `scripts/build-userscript.ts`
拼装为单个 `.user.js` 文件。

```bash
bun install
bun run build:userscript
```

最终可安装脚本输出到：

```text
dist/BewlyScript.user.js
```

## 兼容层

- `webextension-polyfill` 在 userscript 构建中被 Vite alias 到 `src/userscript/browser-shim.ts`。
- 使用 `@inject-into content` 保留 GM API。
- `browser.storage.local` 映射到 GM value API，缺失时退回 `localStorage`。
- `browser.runtime.sendMessage` 映射到同进程 API dispatcher，复用上游 background API map。
- 通过 `GM.xmlHttpRequest` / `GM_xmlhttpRequest` 请求 B 站 API，缺失时退回 `fetch`。
- 运行时图形使用 CSS/文本绘制，不再把 `assets/*` 内联进单文件脚本。

## 瘦身边界

- 本 domain 只保留 userscript 构建链路；WebExtension 的 popup/options/manifest/商店打包发布脚本已移除。
- `hls.js`、`flv.js` 保留，避免影响播放相关功能。
- `qrcode.vue` 保留，用于设置页登录二维码。
- `vuedraggable` 保留，用于 Dock 与首页设置项的拖拽排序。
- `src/styles/adaptedStyles/` 保留，用于继续适配尽可能完整的 B 站页面样式。

## 移动端策略

移动端以 `m.bilibili.com` 为第一目标，并由 BewlyScript 完整接管核心页面体验：

- 核心移动页由 `#bewly` shadow DOM 主渲染，原生 m 站 DOM 只作为加载期与失败 fallback，不作为主体验。
- 第一阶段覆盖 Home、Video、Search、Space、Moments、Favorites、History、Watch Later，以及已有的 Bewly 页面。
- 视频页使用 BewlyScript 自绘播放器，优先加载可播放的 MP4/durl，提供分 P、清晰度、倍速、进度、静音、全屏、PiP 和只读弹幕轨道。
- 搜索页、空间页、动态页保持 app 内导航；视频卡片进入 Bewly 自绘视频页，空间用户卡进入 Bewly 空间页。
- 移动 app shell 遵循触控优先与 safe-area 优先：安全区顶栏、内容滚动容器、底部 Dock、设置底部抽屉。
- 视频详情页隐藏普通 Dock，使用视频专用顶栏与底部操作区；其他核心页保留移动 Dock。
- `message`、`account`、`login` 等附属页面暂不接管，仍使用原站跳转或 drawer fallback。
- 继续保留 userscript 单文件构建目标与 Safari Userscripts 安装方式。

桌面端继续复用 BewlyCat 原有页面与组件逻辑。

## 验证

OpenFX 根级 Deno 校验排除 `domains/BewlyScript/`，避免误处理独立 Vue/Vite/Bun workspace。该 domain
的验证入口是：

```bash
bun run check:userscript
```

根仓库级验证仍使用：

```bash
deno task check
```

## 开发与贡献

这个 OpenFX domain 当前只维护 BewlyCat 的 userscript 单文件构建。开发入口如下：

```bash
bun install
bun run build:userscript
bun run check:userscript
deno task check
```

可安装产物输出到 `dist/BewlyScript.user.js`。

WebExtension 的 popup/options 页面、manifest 生成、CRX/XPI/ZIP 打包和扩展商店提交流程不再属于本
domain 的维护范围。

---

# Upstream BewlyCat

![GitHub Release](https://img.shields.io/github/v/release/keleus/BewlyCat?label=Github) ![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/oopkfefbgecikmfbbapnlpjidoomhjpl?label=Chrome) ![Edge Addons Version](https://img.shields.io/badge/dynamic/json?color=blue&label=Edge&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Faaammfjdfifgnfnbflolojihjfhdploj&prefix=v) ![Firefox Version](https://img.shields.io/amo/v/bewlycat?label=Firefox)

![Github Downloads](https://img.shields.io/github/downloads/keleus/BewlyCat/total?label=Github%20Downloads) ![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/oopkfefbgecikmfbbapnlpjidoomhjpl?label=Chrome%20Users) ![Edge Addons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=%24.activeInstallCount&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Faaammfjdfifgnfnbflolojihjfhdploj) ![Firefox Users](https://img.shields.io/amo/users/bewlycat?label=Firefox%20Users)

此项目基于[BewlyBewly](https://github.com/BewlyBewly/BewlyBewly)开发，并在其基础上进行功能扩充和调整，并合并了一些其他拓展的功能。

<p align="center" style="margin-bottom: 0px !important;">
<strong>BewlyScript</strong><br/>
</p>

<p align="center">只需对您的 Bilibili 主页进行一些小更改即可。</p>

## 👋 介绍

> [!IMPORTANT]
> 本插件及Fork代码禁止以任何形式的客户端封装！！！插件的目的是仅优化B站官方网站的使用体验。
>
> 该项目面向我个人使用习惯修改。当然，欢迎功能建议与bug反馈。
>
> 浏览器拓展商店上架均同时提交审核，实际更新速度取决于各个商店审核速度。请勿在issue中催促审核，商店异常行为由商店导致！
>
> 不会打包safari，也不会在项目里做大量的safari only适配，如果有需要欢迎自行打包。
>
> 本项目由MIT许可在原项目基础上开发，并亦与原作者联系取得了授权，包括上架Chrome应用商店等权利。

> [!CAUTION]
> 为了本项目能够在Github中直接被搜索到，项目将脱离BewlyBewly的Fork网络，成为一个独立的项目。但项目基于BewlyBewly是不变的～项目不会移除历史贡献者和原项目信息。
>
> B站于2026年1月调整了首页推荐API，请更新至`1.5.6`版本及以上，以适配新的首页推荐，排行榜和分区。

## 主要功能异同

### 新增功能

1. 新增视频卡片、顶栏链接后台打开的能力。
2. 新增默认播放器样式设置，当播放器样式是默认和宽屏的时候会自动滚动到弹幕框与底部平齐。
3. 新增用户面板大会员权益领取入口。
4. 新增首页推荐前进后退的能力。
5. 新增合集播放自动关闭功能（需要在设置里开启），方便挂合集听歌。
6. 新增web模式推荐按照点赞/播放比例过滤视频的能力（需要设置里开启）
7. 参考了`Extension for Bilibili Player`插件的快捷键，支持了其中大部分功能的自定义快捷键。
8. 音量均衡功能，可以自定义每个UP的音量相比基准音量增减
9. 记住倍速比例功能，开启后会记住上次倍速
10. 合集视频随机播放功能
11. 视频详情页稍后再看外置
12. 自定义暗色基准色，开启后会根据基准色调整暗黑模式的显示
13. 新增合集视频保持默认播放模式功能

### 删除功能

1. ~~删除了原插件广东话翻译~~广东话翻译由BewlyBewly插件原作者维护（缺少翻译情况下默认显示英文翻译结果）
2. 删除了内置字体，减少打包体积（14.4M -> 600K）
3. 删除了旧版顶栏（减少开发成本），并重构了原项目的顶栏组件（功能无差异）
4. 删除了部分影响功能正常使用的动画（如抽屉打开关闭的动画）

## ⬇️ 安装

### 在线安装

[Chrome应用商店](https://chromewebstore.google.com/detail/oopkfefbgecikmfbbapnlpjidoomhjpl)

[Edge应用商店](https://microsoftedge.microsoft.com/addons/detail/bewlycat/aaammfjdfifgnfnbflolojihjfhdploj):审核周期不定

[Firefox应用商店](https://addons.mozilla.org/en-US/firefox/addon/bewlycat/):已上线～（`1.0.2`版本已经修复抽屉问题）

> [!CAUTION]
> 审核可能存在延迟，Chrome一般会晚30分钟-15天，Edge一般会晚3-30天，Firefox一般会晚1-30分钟

### 本地安装

[CI](https://github.com/keleus/BewlyCat/actions)：使用最新代码自动构建

[Releases](https://github.com/keleus/BewlyCat/releases)：稳定版

#### Edge 和 Chrome(推荐)

> 确保您下载了 [extension.zip](https://github.com/keleus/BewlyCat/releases)。

在 Edge 浏览器中打开 `edge://extensions` 或者在 Chrome 浏览器中打开 `chrome://extensions` 界面，只需将下载的 `extension.zip` 文件拖放到浏览器中即可完成安装。

<details>
 <summary> Edge & Chrome 的另一种安装方法 </summary>

#### Edge

> 确保您下载了 [extension.zip](https://github.com/keleus/BewlyCat/releases) 并解压缩该文件。

1. 在地址栏输入 `edge://extensions/` 并按回车
2. 打开 `开发者模式` 并点击 `加载已解压的拓展程序` <br/> <img width="655" alt="image" src="https://user-images.githubusercontent.com/33394391/232246901-e3544c16-bde2-480d-b770-ca5242793963.png">
3. 在浏览器中加载解压后的扩展文件夹

#### Chrome

> 确保您下载了 [extension.zip](https://github.com/keleus/BewlyCat/releases) 并解压缩该文件。

1. 在地址栏输入 `chrome://extensions/` 并按回车
2. 打开 `开发者模式` 并点击 `加载已解压的拓展程序` <br/> <img width="655" alt="Snipaste_2022-03-27_18-17-04" src="https://user-images.githubusercontent.com/33394391/160276882-13da0484-92c1-47dd-add8-7655c5c2bf1c.png">
3. 在浏览器中加载解压后的扩展文件夹

</details>

### BewlyCat&BewlyBewly贡献者

[![Contributors](https://contrib.rocks/image?repo=keleus/BewlyCat)](https://github.com/keleus/BewlyCat/graphs/contributors)

## ❤️ 鸣谢

- [BewlyBewly](https://github.com/BewlyBewly/BewlyBewly) - 该项目的基础
- [vitesse-webext](https://github.com/antfu/vitesse-webext) - 该项目使用的模板
- [UserScripts/bilibiliHome](https://github.com/indefined/UserScripts/tree/master/bilibiliHome),
[bilibili-app-recommend](https://github.com/magicdawn/bilibili-app-recommend) - 获取访问密钥的参考来源
- [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) - 部分功能实现
- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=keleus/BewlyCat&type=Date)](https://www.star-history.com/#keleus/BewlyCat&Date)
