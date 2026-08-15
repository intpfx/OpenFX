# OpenFX Agent Guide

## Mission

OpenFX 是个人项目集合 monorepo。Agent 应以实际源码、配置、测试和运行结果为事实来源，
同时保持长期可维护、可测试和公开可读。

## Core principles

- 优先纯函数、不可变数据转换和显式状态机。
- 只有生命周期或集成约束明确需要时才引入有状态对象。
- 入口层只负责 I/O、渲染和运行时装配，业务逻辑留在 domain 或共享模块。
- 不用历史文案代替源码核验，不把构建产物当作实现来源。
- 人类可见文案默认使用简体中文。
- 保留用户已有修改；不要回退无关 dirty work。

## Source and documentation policy

开始结构性工作前阅读根 `README.md` 与本文件。项目不再维护 `.agents/skills/` 或 domain
级说明文档：

- `README.md` 是唯一的人类文档；
- `AGENTS.md` 是唯一的 Agent 规则文档；
- 行为、命令、架构或公开接口变化必须同步更新其中对应章节；
- 不新增 README、AGENTS、SKILL、设计稿、计划或 QA Markdown；
- LICENSE、NOTICE、代码注释、类型和测试夹具不属于该限制。

## Repository workflow

1. 用 `rg` / `rg --files` 定位源码、配置、测试和调用点。
2. 检查 `git status --short`，区分本任务与用户已有改动。
3. 默认在当前 main worktree 工作；仅在存在真实隔离需求时新建 worktree。
4. 先运行覆盖改动范围的窄验证，再运行跨边界验证。
5. 未经明确要求不提交、不推送、不打 tag、不部署。
6. 删除 domain、本机项目或远端资源前必须得到明确确认，并先核验精确路径和依赖。

## Stack boundaries

- **Web**：VitePlus + React 客户端，Nitro 服务端，Deno Deploy 生产目标。
- **Root tooling**：优先 Deno 原生命令与根 `deno.lock`。
- **Root/Web manifests**：根目录与 `web/` 只使用 `deno.json`；不要恢复根
  `package.json`、`package-lock.json` 或把 Web 启动重新绑定到 Node workspace 发现。
- **Independent domains**：允许保留自身 Bun/pnpm/Nuxt/Electron 工具链，不强行并入根
  workspace。
- **Shared code**：只有运行时边界明确、跨产品确实复用的纯算法或基础设施才放
  `domains/_shared/`。

## Web and file library

关键位置：

- `web/src/App.tsx`
- `web/src/styles.css`
- `web/src/file-library/`
- `web/content/library-apps.json`
- `web/library-app-catalog.ts`
- `web/publication-targets.ts`
- `web/server/routes/`
- `web/tests/`

规则：

- 首页是可直接使用的 OPFS 文件库，不是营销落地页，也不浏览用户本机目录。
- App 内容、catalog renderer、`App.tsx` 组件分支和测试必须保持一致；不要恢复平行的 App
  ID 列表。
- 文件库加载、mutation、存储估算、后台照片/指纹/缩略图任务和浏览器事件统一通过
  `file-library-session.ts`；React 页面不重新拼装这些工作流。
- App 有真实同源页面时才使用动态 preview；否则使用稳定纯色色块和大字号名称。
- 文件源字节保存在 OPFS；索引迁移不得无故重写源文件。
- 预览能力失败时应降级为原件下载，不丢弃导入内容。
- HEIC/HEIF 预览只能在可取消的本机处理边界生成 JPEG 代理；代理不得替换原始静态帧，
  SHA-256、原片组合与 LIVP 导出始终使用原始字节。
- Live Photo、缩略图、EXIF 等重处理放在可取消/可恢复边界，避免阻塞整个导入批次。
- Live Photo 下载应明确区分原片静态帧 + 动态片段、JPEG 兼容组合与单文件 OpenFX LIVP；
  不把浏览器文件选择器或 PWA 分享入口表述为可静默读取 Apple Photos 图库。
- SHA-256 是完全重复的事实来源；PDQ 只产生图片和视频的相似候选，不可代替源字节比较。
- 视频相似度使用相对时间采样帧、时长容差和多数帧规则；Live Photo 必须同时比较静态图
  与动态片段，不能只看封面。
- 完全重复与视觉相似结果只用于把成员自动组织为同一网格组，组是由当前指纹派生的展示状态，
  不写回索引。任何自动删除、自动保留最佳版本或批量覆盖都必须另行得到明确授权；分析失败
  不得影响原件下载，失败指纹由 session 在后续启动时限次重试。
- 不恢复已退役的 LivpExplorer 应用；Live Photo、照片元数据和 LIVP 能力以文件库及
  `_shared/livp-codec.ts` 为唯一事实来源，ChronoFrame MIT 归属保留在根 `NOTICE`。
- UI 改动在 Codex in-app browser 验证桌面和窄屏；不可用时再用 Safari。

## Nitro and Deno Deploy

- 路由只负责解析输入、调用 helper/domain、返回稳定的小响应。
- 公共 API 必须校验输入并保持稳定错误形状。
- 共享服务端逻辑需同时兼容 Nitro dev 的 Node 环境和 Deno Deploy bundle。
- 不把 Node-only API 带入 Deno Deploy 路径，除非有明确构建/运行时隔离。
- 修改嵌套路由时检查相对 import；生产 build 比 dev 更严格。
- Deno Deploy 动态入口从 `web/.output` 运行，并通过 Nitro 的 Deno 文件系统 handler 读取
  `.output/public`；不要把大型客户端、Worker、WASM 或媒体资源内联进 server entry。
- 当前公开边界为 `/api/health`、`/api/how-much/*`、
  `/api/map-poster/render`、`/media-player/*` 和 `/hlc/*`。
- 静态发布目录、缓存、开发代理和构建前准备统一登记在 `publication-targets.ts`；
  Nitro/Vite/构建脚本只实现各自 adapter。

## Domain rules

### `domains/e`

- `src/core/` 保存运行时无关内核、状态机和供应商无关接口。
- `src/app/` 保存 reference runtime；产品层优先扩展 `EAgentRuntime`，不要重新拼装
  `AgentLoop`、`ToolRunner` 和 `SessionManager`。
- `src/foreground/` 只定义前台进度与控制协议，真实执行留在后台 runtime。
- 文件系统、模型、Git、MCP 和存储副作用使用注入适配器。
- 高风险能力必须经过 `SafetyActionGate`，并可写入 `TurnRecord` 或 replay。
- 新模型实现 `ModelProvider`；新存储优先扩展 `KvStore` key 约定。
- 任何行为变化都更新 `domains/e/tests/`；公共类型变化同步 fixture。

### `domains/BewlyScript`

- 交付面是 Safari Userscripts/Tampermonkey 单文件 userscript，不恢复 WebExtension
  popup、options、manifest 或商店包。
- 完整美化目标是 `www.bilibili.com` 桌面原站；窄屏仍是桌面站响应式适配。
- `m.bilibili.com` 只在 document-start 提示请求桌面站，不挂载主 Vue App。
- 保留 B 站原生桌面播放器，不把视频页重定向到旧自绘移动详情页。
- `src/contentScripts/mount-app.ts` 是生产/开发共享挂载边界；`src/runtime/` 保存可注入
  浏览器运行时；`src/dev/` 保存 Scenario Lab。
- 生成 userscript 后同步 `domains/BewlyScript/public/bewlyscript/BewlyScript.user.js` 与
  `web/public/bewlyscript/BewlyScript.user.js`。
- 主要验证：在 domain 内运行 `bun run check:userscript`。

### `domains/media-player`

- 只保留 OPFS 文件/字幕读取、续播、进度回传、Video.js 控件和固定播放引擎。
- 不恢复媒体目录、Firebase、TMDB、跨设备同步、扩展、落地页或调试页。
- vendor 引擎来自 `playsvideo@0.4.7`；来源或许可证变化时同步 LICENSE/第三方声明。
- `.openfx-public/` 是由 domain build 生成并经 CI 差异校验的发布快照；Deno Deploy 构建
  直接复用，避免在 3 GiB builder 中嵌套运行 pnpm install。修改播放器源码时必须本地
  重建并提交同步后的快照。

### `domains/openfx-macos`

- 只承载当前 Web 文件库的 Perry macOS 壳、持久 WKWebView、loopback 静态服务与原生 Photos
  导入桥，不在原生层复制文件库状态机或 OPFS 模型。
- WebView 固定使用 `http://127.0.0.1:15501` 和非 ephemeral 数据存储；不要改为每次启动
  变化的 origin，也不要宣称与 Safari/Chrome 共享物理 OPFS。
- 原生 Photos 导入必须由用户动作触发系统选择器，一次只选择一张 Live Photo，并从同一
  `PHAsset` 提取原始 photo 与 paired video；不得枚举、上传或静默读取图库。
- 原生资源使用 loopback、每次启动随机 token 和二进制流传输；不要通过 base64、公开端口
  或无鉴权 URL 传送照片。Web 收到资源后统一转成 `File[]` 并调用
  `file-library-session.ts`，不得直接写索引或另建存储实现。
- Photos 权限文案和 entitlement 必须保留在 App bundle；正式分发签名与 notarization 是
  独立发布边界，未经明确要求不操作证书或发布服务。
- 主要验证：在 domain 内运行 `bun run check` 与 `bun run build`，再校验
  `dist/OpenFX.app` 的 Info.plist、签名和 loopback 启动。

### `domains/map-poster`

- SVG 是 canonical 输出，渲染逻辑保持确定性和可测试。
- 地图点选坐标是位置事实；city/country 只作标题。
- 输入校验与生成 use case 保持在 `src/web-service.ts`，Nitro helper 只注入 Nominatim；
  Web Mercator 与可见瓦片计算保持在纯函数 `src/viewport.ts`。
- `FetchResult` 等跨 Overpass、renderer、use case 的类型只在 `src/types.ts` 定义。
- 测试避免网络，使用 fixture、预设或显式坐标。
- 保留 `originalankur/maptoposter` 来源与 OpenFX 改造说明。

### HLC、Finlyzer 与历史项目

- HLC Web 面只发布同源只读展示，不接入登录、Deno KV 或写入工作流。
- Finlyzer 保持本地优先，金额全链路使用整数分；不恢复退役交易对手模型。
- Wanone 等纪念项目保留其原生结构，不为统一技术栈而重写。

## Migration and cleanup

- 迁入旧项目时先确认来源、许可证、分支状态、产品身份和可复用能力。
- 独立产品留在 `domains/<name>/`；纯算法进入 `domains/_shared/`；静态纪念项目原样 保存。
- 列出能力后再决定迁入范围，不因代码相似而合并产品身份。
- 清理旧 domain 前证明入口、构建、运行路由和测试均已切断，再执行物理删除。
- 旧目录若未被 Git 跟踪，删除后无法通过 Git 恢复，必须在执行前明确说明。

## Release and deployment

- 构建元数据使用 `VITE_OPENFX_BUILD_TIME` 和 `VITE_OPENFX_BUILD_HASH`。
- Deno Deploy CLI 从仓库根执行；根 `deno.json` 保存 `universes/openfx` 的 App、build 和
  runtime 配置。未经明确要求不运行远端 deploy 命令，生产发布还必须显式使用 `--prod`。
- 推送或部署前只暂存本任务文件，不能混入用户其他 dirty changes。
- CI 失败先定位第一个真实失败 gate，再改变代码。
- 只有用户明确要求时才 push、tag、deploy 或操作远端分支。

## Validation

根基线：

```bash
deno task check
deno task build
```

确定性 Web 构建：

```bash
VITE_OPENFX_BUILD_TIME=2026-08-10T00:00:00Z \
VITE_OPENFX_BUILD_HASH=local00 \
deno task --config web/deno.json build
```

按范围补充：

- Web/API：更新 `web/tests/` 并运行对应测试。
- Agent framework：`deno test --allow-env domains/e/tests`。
- Map Poster：`deno test --allow-env web/tests/map-poster.test.ts`。
- Media player：在 domain 内运行 format、lint、typecheck、test 和 build。
- macOS App：在 `domains/openfx-macos` 内运行 `bun run check` 与 `bun run build`。
- BewlyScript：`bun run check:userscript`。

完成前运行 `git diff --check`，并明确区分本任务通过与仓库既有基线问题。

## External references

涉及栈级假设时优先查官方文档：Deno、Deno Deploy、VitePlus、Nitro、React、Nuxt、
Vue、OPFS 和各独立 domain 的工具链。技术结论必须回到当前 checkout 验证。
