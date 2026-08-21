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
- `web/src/file-library/private-mesh.ts`
- `web/src/file-library/private-mesh-key-vault.ts`
- `web/src/file-library/private-mesh-recovery.ts`
- `web/src/file-library/private-mesh-store.ts`
- `web/src/file-library/private-mesh-catalog.ts`
- `web/src/file-library/private-mesh-catalog-sync.ts`
- `web/src/file-library/private-mesh-catalog-store.ts`
- `web/src/file-library/private-mesh-thumbnail.ts`
- `web/src/file-library/private-mesh-transport.ts`
- `web/src/file-library/private-mesh-transfer.ts`
- `web/src/file-library/private-mesh-staged-file.ts`
- `web/content/library-apps.json`
- `web/library-app-catalog.ts`
- `web/publication-targets.ts`
- `web/server/routes/`
- `web/tests/`

规则：

- 首页是可直接使用的 OPFS 文件库，不是营销落地页；支持 File System Access API 的安全
  顶层环境可以由用户明确选择一个本地文件夹作为只读视图，但不得宣称、请求或模拟全盘访问。
  不支持该 API 时保留显式文件选择导入。
- App 内容、catalog renderer、`App.tsx` 组件分支和测试必须保持一致；不要恢复平行的 App
  ID 列表。
- 文件库加载、mutation、存储估算、后台照片/指纹/缩略图任务和浏览器事件统一通过
  `file-library-session.ts`；私有网络创建/配对也必须由 session 统一编排，React
  页面不重新 拼装这些工作流或接触本机私钥。
- 本地文件夹句柄只能保存在同源 IndexedDB；目录条目、相对路径和预览属于只读派生视图，
  不得写入
  `FileLibraryIndex`、私有网络目录或后台分析队列。只有用户点按对应格右下角圆点后，
  `file-library-session.ts` 才能把该文件复制进 OPFS
  并登记索引；外部原件后续变化不自动同步。
- 搜索 Nebula-Orb 与来源 Bloub 只接收宿主传入的语义状态，各自管理可见性、减少动态效果和
  卸载清理，不读取文件索引、OPFS 或目录句柄。来源、许可证与 Bloub 的设计权利边界保留在
  `NOTICE`；按钮内 glyph 不自动轮播全部演示形态。
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
- 音频标签、内嵌封面与内嵌歌词只在可取消的本机后台边界解析；封面是派生预览，不能替换
  原音频字节。音乐网格优先显示封面，无封面时使用稳定纯色与大字号曲名；无时间轴歌词只能
  按原文展示，不能伪造逐字同步，解析失败仍退回可播放/可下载原件。音乐播放控件复用视频
  播放器的 Video.js 状态与皮肤体系，但使用音频预设和紧凑布局，不恢复浏览器原生控件。
- 完全重复与视觉相似结果只用于把成员自动组织为同一网格组，组是由当前指纹派生的展示状态，
  不写回索引。任何自动删除、自动保留最佳版本或批量覆盖都必须另行得到明确授权；分析失败
  不得影响原件下载，失败指纹由 session 在后续启动时限次重试。
- 不恢复已退役的 LivpExplorer 应用；Live Photo、照片元数据和 LIVP 能力以文件库及
  `_shared/livp-codec.ts` 为唯一事实来源，ChronoFrame MIT 归属保留在根 `NOTICE`。
- UI 改动在 Codex in-app browser 验证桌面和窄屏；不可用时再用 Safari。
- 私有设备网络不引入账号、中心用户表或服务端设备目录；`PrivateMesh` 根公钥是网络身份，
  根签名成员证书是加入事实，设备名只作人类可见标签。
- 设备配对请求必须短时有效、由请求设备签名、带一次性 ID 并显示双方一致的校验码；已使用
  请求不得再次批准。普通成员默认无邀请权限。
- 网络密钥只通过请求设备的加密公钥传递；配对响应使用 ECDH P-256 派生的一次性密钥和
  AES-256-GCM，不把网络密钥、根私钥或设备私钥放进 session snapshot、日志或 URL。
- 私有网络状态独立保存在 `/openfx-private-mesh/state.json`，不得并入文件索引或为迁移而
  重写原件。加载时验证成员证书，损坏状态不得静默重置或覆盖。
- 日常设备私钥必须在同源 IndexedDB 中以不可导出 `CryptoKey` 持久化；OPFS 状态只保存密钥
  引用。只有创建所有者恢复材料时可以一次性导出根私钥，并必须先经口令派生密钥加密再显示。
- v1 JWK 状态迁移必须先导入并验证本机密钥，再保留 `state.v1-backup.json` 原文备份，最后
  写入 v2 引用状态。任一步失败都应保留旧状态并阻止联网，不能静默生成新身份。
- 成员撤销只能由持有根签名密钥的所有者执行，不能撤销本机所有者。撤销必须单调增加网络
  epoch、轮换网络密钥、重新签发全部保留成员证书，并为每台保留设备生成独立加密更新码；
  只从列表删除成员而不换密钥和证书属于无效撤销。
- epoch 更新必须先在接收设备持久化并验证根签名、成员唯一性、本机公钥绑定和新网络密钥，
  再通过 DataChannel
  返回确认。所有者在确认前必须持久保留逐设备更新码；旧代次离线设备之间 可能暂时互通，UI
  和文档不得宣称无中心撤销可以瞬时覆盖全网。
- 浏览器传输、发现和中继必须是可替换 adapter。发现/中继只能处理端到端加密或不透明连接
  数据，没有成员批准权。
- WebRTC SDP 必须绑定网络 ID、发送/接收成员、短时会话 ID 和有效期，并由发送设备签名；
  不能接受仅依赖 SDP 指纹、设备名或未验证成员 ID 的连接码。当前人工直连默认不使用公共
  STUN；只有双方明确选择时才使用固定 STUN 服务辅助发现直连地址，不提供 TURN 中继， Deno
  Deploy 不承担信令。answer 接收端等待 DataChannel 的期限不得短于连接码有效期；页面或
  session 关闭时必须清理待接管连接。
- 远程目录默认只传文件名、类型、大小和更新时间，不传 OPFS 路径、照片 GPS 或原件字节；
  原件必须由用户动作按需请求。当前 4 MiB 单文件和不含 Live Photo 组合是显式首切片限制，
  接收端必须逐块校验 SHA-256、有序更新哈希链并写入未索引 OPFS 暂存，落盘确认后发送端才
  继续；只有声明长度、分块数和最终哈希链全部匹配，才能登记索引。检查点必须在字节 flush
  后以可恢复双槽记录持久化，并按网络、设备与远端条目隔离；重开时必须校验元数据和前缀哈希
  链，并回滚未确认尾部。用户明确取消或关闭面板应清理暂存；session 停止、超时、暂存写入
  失败或连接关闭应停止远端发送并保留最近一次已确认检查点，默认 24 小时后清理。接收前必须
  按剩余字节与安全余量预检 OPFS 配额。放宽现有 4 MiB 限制前仍须完成真实双设备断线续传与
  容量边界验收，不能只提高常量。
- 远端目录按设备完整快照持久化到
  `/openfx-private-mesh/catalog.json`，只能作为离线展示缓存； session
  加载和成员变更时必须按当前网络 ID 与已授权远端成员过滤，撤销成员的快照必须清除。
  缓存不得成为成员权限、文件存在性或同步完成的事实来源，也不得写入本机文件索引；缓存损坏
  可以忽略，但不能覆盖或阻断已验证的网络身份。
- 在线目录变化只发送失效事件；接收端必须重新请求并校验完整快照，不能把通知载荷当成目录
  增量。session 负责广播真实目录变化并按远端设备合并密集刷新；断线时取消待处理刷新。
  WebRTC PeerConnection 和短时 SDP 不得持久化，也不得把在线汇合表述为离线传播、文件同步
  或跨重启自动重连。
- 远程缩略图只能使用图片或已有视频预览生成最长边 320 px、不超过 128 KiB 的 WebP
  派生字节；目录只传版本描述。缩略图必须独立缓存在
  `/openfx-private-mesh/thumbnails/`，不得覆盖原始引用、HEIC 静态帧或本机文件索引。
  session 负责请求去重、有界预取、版本失效和成员撤销后的精确清理；任何失败都只降级为
  占位图，不得触发原件读取或阻断后续用户操作。

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
- Deno Deploy 不保存私有网络账号、成员、目录、信令、原件或密钥；新增这些服务端边界前
  必须另行确认产品架构，不得把配对基础默认扩展成中心控制面。
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

### `domains/openink`

- 原始 `x/y/pressure/time` 点列是笔画事实；不得只保存 `perfect-freehand` 输出多边形，
  改粗细或后续笔刷变化必须从原始点重算。
- `perfect-freehand` 只负责笔画几何，调用时显式传入 `size`、`thinning`、`smoothing`、
  `streamline`、`simulatePressure` 与 `last`，不依赖可能变化的隐式默认值。
- 选择、移动和缩放只更新内容 transform，不重写原始点或照片蒙版；套索与原生笔画相交时选择
  整笔，照片墨迹则按像素切成独立片段。一个擦除、套索切分或变换手势只生成一次历史
  commit， 避免撤销粒度泄漏 Pointer Events 频率。
- 画稿库在同源 `/openink-documents/` OPFS 中保存不可变正文修订与双槽目录；目录只有在正文
  成功关闭后才能切换代次，读取时优先最高完整代次并回退旧槽，不静默覆盖损坏状态。旧
  `localStorage` v1 单画稿只能在 OPFS 成功吸收或确认已有同 ID 更新版本后删除；OPFS
  不可用时保留兼容保存，恢复后不能因目录已存在而丢弃兼容稿。
- 多画稿支持列表、派生 SVG 缩略图、新建、重命名和复制；缩略图不成为独立存储事实，暂不
  提供整张画稿删除、标签或云同步。
- 画稿 v3 用显式图层持有原生笔画与照片墨迹的有序引用；图层数组按从底到顶排列，旧 v1/v2
  内容必须无损迁入默认“墨迹”层。活动层只决定新内容去向，切换活动层不进入撤销历史；新建、
  重命名、排序、显隐、锁定和删除属于可撤销画稿变更。隐藏层不显示或导出，锁定层不得被
  选择、套索、变换、擦除或删除内容；删除非空图层必须先由用户确认，且始终保留至少一层。
- 照片导入只接受用户显式选择的本机图片，原始字节按 SHA-256 不可变保存到同源
  `/openink-documents/assets/source/`，不得上传或写入画稿 JSON；手动四角透视、纸张背景与
  阴影清理、阈值、降噪和粗细在 Worker 中处理，蒙版与 SDF 作为可重建派生资产保存到
  `assets/derived/`。不伪装自动边缘识别、旋转、逐图层材质或 Carbo 专有格式。
- 材质是画稿级展示状态，固定提供“默认、黑板、蓝图、正文、纸张、像素、素描、沃霍尔”八种
  OpenInk 预设；这是对 Carbo 导出模板能力的独立实现，不读取或输出其专有格式。纹理、边缘
  柔化和渗墨必须同时作用于原生笔画与照片墨迹，不能重写源几何、蒙版或原片。粉笔、蓝图、
  凸版、纸张、像素、石墨和套色效果必须在实时画布、画稿缩略图及 canonical SVG 中使用同一
  组确定性预设语义；像素材质必须让原生笔迹和照片墨迹共同经过粗栅格像素单元，并允许量化
  派生轮廓，但不得修改原始压力点或照片蒙版。
- SVG 是 canonical 导出，必须嵌入本机派生的照片墨迹而非原片；PNG 只由完整 SVG 在本机
  派生。导出和存储失败不得清空当前画稿。
- `public/openink/` 是 domain build 生成的同源发布快照。修改源码后运行
  `deno task build`，并保持 publication target、App catalog、renderer 与测试一致。

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
- 私有网络身份、证书和配对：运行 `web/tests/private-mesh.test.ts`，并通过 session
  测试确认所有持久化 mutation 都由 `file-library-session.ts` 编排；撤销必须覆盖新
  epoch、 新密钥、剩余证书、目标绑定更新码和无效待更新状态。
- 私有网络连接和按需文件传输：运行 `web/tests/private-mesh-transport.test.ts` 与
  `web/tests/private-mesh-transfer.test.ts` 与
  `web/tests/private-mesh-staged-file.test.ts` 与
  `web/tests/private-mesh-catalog-sync.test.ts` 与
  `web/tests/private-mesh-thumbnail.test.ts`，再在两个独立 origin 完成人工
  offer/answer、远程目录、派生缩略图、小文件导入、断线后手工重连续传和在线 epoch
  更新确认验收。
- Agent framework：`deno test --allow-env domains/e/tests`。
- Map Poster：`deno test --allow-env web/tests/map-poster.test.ts`。
- OpenInk：在 domain 内运行 `deno task check` 与 `deno task build`，再在桌面和窄屏验证
  压感/鼠标绘制、成组擦除、选择移动缩放、撤销重做、旧单画稿迁移、多画稿新建/切换/重命名/
  复制、照片四角校正与实时清理、SDF 粗细/柔化、套索切分与统一变换、图层新建/重命名/排序/
  显隐/锁定/删除、八种材质预设、重载恢复与包含照片墨迹的 SVG/PNG 下载。
- Media player：在 domain 内运行 format、lint、typecheck、test 和 build。
- macOS App：在 `domains/openfx-macos` 内运行 `bun run check` 与 `bun run build`。
- BewlyScript：`bun run check:userscript`。

完成前运行 `git diff --check`，并明确区分本任务通过与仓库既有基线问题。

## External references

涉及栈级假设时优先查官方文档：Deno、Deno Deploy、VitePlus、Nitro、React、Nuxt、
Vue、OPFS 和各独立 domain 的工具链。技术结论必须回到当前 checkout 验证。
