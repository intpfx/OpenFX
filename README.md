# OpenFX

OpenFX 是一个以 TypeScript 为主的个人项目集合。当前主产品是使用 OPFS 的 Web 文件库，
并由 Perry 提供复用同一 Web 产品的 macOS 版本；仓库同时保留可独立运行的 domain、历史
项目和可复用能力模块。

## 当前产品

`web/` 提供 VitePlus + React 客户端和 Nitro 服务端，部署目标为 Deno
Deploy。首页不是本机文件浏览器，也不是营销页，而是由应用自管理的文件库：

- 用户可从导入格直接唤起系统照片选择器，也可通过通用文件选择器、拖放、PWA 文件处理器
  或系统分享入口显式导入内容；浏览器不会静默读取完整 Photos 图库；
- 原始字节和索引保存在当前 origin 的 `/openfx-file-library/` OPFS
  空间，不保留本机路径映射；
- 图片、实况图片、视频、音频、文本和 PDF 可在应用内预览；音频导入后会在本机后台读取
  曲名、歌手、专辑、内嵌封面与内嵌歌词；网格优先以专辑封面展示，无封面时使用稳定纯色
  与大字号曲名，HUD 与全屏播放器沿用同一音乐视觉；音乐播放控件复用视频播放器的 Video.js
  10 状态与皮肤体系，并通过音频预设适配为紧凑时间轴、前后跳转、倍速和音量控制；
  无时间轴歌词以大字号滚动正文展示，不伪造逐字同步；
- 不支持预览的格式仍保留原件并提供下载；
- 音频标签/封面/歌词、视频缩略图、字幕关系、播放位置、观看状态和媒体智能视图由文件库
  索引维护；
- 照片在导入落盘后由可取消 Worker 解析 EXIF、位置和 Motion Photo；HEIC/HEIF 同时在本机
  生成 JPEG 预览代理，原始字节保持不变；任务状态持久化，中断后可恢复、失败后可重试；
- 照片可按拍摄日期、实况、收藏、位置和相册派生查看，不复制原始字节；
- 20 个内置 App 作为只读虚拟条目合并到同一内容墙，不占用 OPFS 配额。
- 用户可以在本机创建不依赖账号的私有设备网络，或生成一次性配对请求加入已有网络；成员
  证书和网络密钥保存在本机 OPFS，设备私钥作为不可导出的 `CryptoKey` 保存在同源 IndexedDB
  密钥保险库，Deno Deploy 不保存私有网络状态。

文件库内容墙使用无间距正方形网格。少量内容只占需要的列，未占用区域保持磨砂背景；
触屏可像照片应用一样双指缩放，在 2–5 列之间切换并保存本机显示偏好。完全相同或视觉相似
的内容会自动合并为一个联系表式网格格子；点按组格后，页面顶部 HUD 同时列出全部成员，
再点按其中一个才进入单文件查看器。普通内容仍直接更新 HUD 预览，点按可打开内容的 HUD
任意空白或预览区域会进入全屏详情；收藏操作只保留无底色的心形线条图标。视频与实况照片
被选中后会在 HUD 中默认静音循环播放；实况照片格只在左下角保留类型标识，不再叠加右上角
`LIVE` 标签。尚未选择内容时，HUD 显示当前站点的已用空间、浏览器估算配额、剩余
配额与持久存储状态，再次点按已选内容或组格会取消选择并回到该概览；App 若只是说明型项目，
不再进入独立详情页，而是由 HUD 直接展示 catalog 的名称、技术栈、
项目说明、关键能力、来源路径和可用入口；只有真实同源预览或可操作组件保留打开入口。
摘要型 App 的 GitHub 链接不占用正文空间，而以 GitHub 线性图标显示在右下角收藏图标旁；
Greasy Fork、Userscript 下载等其他入口仍保留在摘要内。
当前选中格不使用高亮描边，而是轻微放大上移并覆盖相邻网格，形成从内容墙中被拾起的层次反馈。
内容墙第一格始终是导入入口，搜索直接嵌入未选择内容时的空间 HUD；搜索命中组内任意成员时
会保留整个组。选中单项后不再显示独立的打开按钮；保存链接、新建文本和手动查重入口及其创建
功能均不再提供。所有操作使用轻量线性图标，悬停只高亮图标线条。当前网格项数直接
写入搜索占位文案；页面不提供手动明暗开关，只实时跟随系统主题。移动端竖屏时 HUD
预览固定在顶部并占约 40% 视口高度；下方内容矩阵以直角边界无缝衔接并独立滚动。单文件
查看器不再使用独立的底部文件胶囊，而是沿用播放器的黑色玻璃控件语言：非视频内容把返回与
文件身份固定在左上角，收藏、信息、编辑、下载和删除组成右上角动作组；视频的返回、编辑、
下载和删除直接进入播放器内部的左上控件组，并通过同源、当前 iframe 与条目 ID 三重校验的
消息交回文件库执行。非 App 条目可在编辑面板
修改文件名，图片与实况图片还可同时维护相册，保存只更新索引与下载名，不重写原始字节。

### 私有设备网络

OpenFX 不使用账号区分设备。首台设备创建 `PrivateMesh` 后成为所有者，并生成网络根密钥、
本机签名/加密密钥、根签名的成员证书和恢复码。新设备自行生成密钥和十分钟有效的一次性
请求码；所有者设备验证请求签名、核对双方一致的六位验证码并明确批准后，才签发成员证书。
网络密钥通过临时 ECDH P-256 与 AES-256-GCM 加密给新设备，不以明文放入配对响应。

网络描述、成员证书、网络密钥和本机密钥引用保存在当前 origin 的
`/openfx-private-mesh/state.json` OPFS
文件中，与文件原件索引分离；实际设备私钥以不可导出 `CryptoKey` 保存在同源
IndexedDB。刷新会重新验证根签名成员证书及本机公私钥匹配关系，
损坏或篡改的状态不会被静默覆盖。旧版 v1 OPFS 状态会先把 JWK 导入不可导出保险库，完整
校验后保留 `state.v1-backup.json` 原文备份，再写入不含私钥材料的 v2 状态；迁移失败不会
覆盖原身份。

普通成员默认可以存储文件但不能邀请新设备；只有持有根签名密钥引用且证书允许邀请的所有者
设备可以批准加入。恢复码包含所有者权限材料，使用用户设置的恢复口令经 PBKDF2-SHA-256 派生
AES-256-GCM 密钥后加密，创建后只在当前面板显示；恢复码与口令必须分别离线保存。
不可导出可以阻止脚本读取原始私钥字节，但不能阻止已在同源执行的恶意脚本调用密钥，后续仍需
把 CSP、依赖供应链和 origin 隔离作为联网前的安全门。

当前实现还提供首个同一局域网传输切片：成员可人工交换由设备签名、十五分钟有效的
`openfx-rtc-v1` offer/answer，建立不经过服务器的 WebRTC DataChannel。连接后先按条目传输
文件名、类型、大小和更新时间；接收设备会在连接码有效期内保留待接管通道，页面刷新或
session 停止才会提前取消等待。只有用户点按“读取”时才以 12 KiB 分块取回不超过 4 MiB 的
单文件原件。接收端逐块校验 SHA-256、更新有序哈希链并写入未索引的 OPFS 源文件；当前块
完成 `flush` 且双槽检查点落盘后才确认发送下一块。只有声明长度、分块数与最终哈希链全部
一致，才登记文件库索引。读取前会按剩余字节与 256 KiB 安全余量预检浏览器估算配额。

读取期间按钮会切换为“取消”。用户明确取消或关闭面板会向提供设备发送取消消息并删除未完成
内容；意外断线、超时、暂存写入失败或 session 停止则保留最近一次已确认检查点 24 小时。
用户重新交换连接码并再次点按同一远端条目的“读取”后，提供设备会重算已确认前缀哈希链，
匹配同一原件才从下一块继续；崩溃后多写但未确认的尾部会先回滚。过期、缺失、元数据改变或
与原件不匹配的暂存不会进入索引。此切片不传本机 OPFS 路径，不自动复制文件，也暂不传 Live
Photo 组合或超过 4 MiB 的文件。连接默认只收集本机候选地址；
用户可以在双方设备上明确允许公共 STUN 辅助寻址， 当前固定使用 Cloudflare STUN，只帮助
WebRTC 发现可直连地址，不传目录或文件，也不提供中继。若设备网络阻断 STUN UDP，公共模式
可能在候选收集阶段超时；同一局域网内可关闭该选项，继续使用本机候选直连。

每次成功读取的远端目录都会作为该设备的完整快照写入
`/openfx-private-mesh/catalog.json`。页面重开或设备离线后仍可显示最近一次受限元数据，但会
明确标成“离线缓存”并禁止读取原件；重新连线后的新快照会整体替换该设备旧快照。加载和成员
变更时只保留当前网络仍获授权的远端成员，撤销设备的缓存随即从展示和持久记录中移除。这个
缓存只是派生展示状态，不是成员权限、文件存在性或同步完成的事实来源；损坏缓存可以忽略，
不会覆盖本机文件索引或阻止打开已验证的网络身份。

在线连接期间，本机受限目录确实变化后只发送轻量失效事件，不把目录或原件塞进通知；接收端
仍通过 DataChannel 请求、校验并整体替换该设备的完整快照。同一设备在一次刷新期间连续产生
的失效事件会合并为至多一次补充刷新，避免导入和后台处理造成并发请求风暴。这个自动汇合只
覆盖当前仍在线的一跳连接，不会自动复制原件，也不等于离线传播或跨重启自动重连。

图片与已有视频预览还会在文件所在设备上按需生成最长边 320 px、不超过 128 KiB 的 WebP
派生缩略图。目录只保存缩略图版本描述，不内联图像字节；远程设备
连线时，文件面板通过同一端到端 DataChannel 自动按需读取，并在
`/openfx-private-mesh/thumbnails/` 下单独缓存。每次 session 最多发起 32 个唯一远程
缩略图请求；损坏、超限、不支持或离线时只退回扩展名占位，不会请求、覆盖或丢弃原件。
HEIC/HEIF 仅使用已有 JPEG 代理生成派生缩略图，原始静态帧仍用于下载、指纹和 LIVP。
目录版本更换或成员被撤销时，不再可达的派生缩略图也会从本机缓存移除。

所有者设备可以撤销普通成员。撤销会先把网络 epoch 单调增加、生成新的 256 位网络密钥，
再由根密钥为全部保留成员重新签发当前代次证书；旧成员证书因此不能再与已更新设备建立新
连接。每台保留设备获得只用其 ECDH 私钥才能解开的 `openfx-epoch-v1` 更新码。已连接设备在
本机持久化新状态后通过 DataChannel
返回确认，离线设备则由用户手工粘贴专用更新码；未确认的 更新码会继续保存在所有者
OPFS，设备以新代次重新连接后才移除。由于没有中心状态源，撤销时
同时离线且尚未更新的旧代次设备之间仍可能暂时互通，不能把本机撤销误述为全网即时抹除。

当前还没有实现自动设备发现、跨重启自动重连、TURN 中继或 Iroh 公网连接、离线目录传播或
多跳汇合、全库缩略图收敛与容量策略、超过 4 MiB
的大文件传输、副本策略、恢复码导入、撤销状态 自动汇合或多所有者协作。即使允许公共
STUN，受 NAT 或防火墙限制的设备仍可能无法直连，刷新后也需要重新交换连接码。后续传输层
必须保持可替换，并把公共发现或中继视为不可信的端到端加密数据通道；Deno Deploy 继续只提供
Web 应用和既有公开产品入口，不新增账号、设备目录、信令、文件索引或网络密钥服务。

### 重复与相似文件

文件库会在导入完成后以可取消的后台任务生成版本化指纹：

- 所有普通文件使用 SHA-256 检测字节完全一致的副本；
- 图片使用 256 位 PDQ 感知哈希识别缩放、压缩或轻微调整后的相似内容；
- 视频在 8%–92% 的相对时间位置抽取最多 8 帧，按 PDQ 序列、时长容差和多数帧匹配；
- 实况图片必须同时满足静态图与动态片段相似；完全重复还要求两部分 SHA-256 均一致；
- 旧索引升级后会自动补算指纹；失败项在每次会话启动时自动重试一次，单个文件失败不影响其
  原件、下载和其他分析任务。

SHA-256 完全相同关系与视觉相似关系会共同形成互不重叠的连通组。只有组内所有成员的原始
字节指纹都相同时才标记为“完全相同”，否则标记为“相似内容”；每个组在内容墙只占一个格子，
组内原件仍各自保存在 OPFS。自动归组不会删除、覆盖或替用户保留某个版本，用户仍需从组 HUD
逐项打开确认并使用现有删除操作，避免感知哈希误判造成数据损失。

### 实况图片边界

当前文件库已经实现：

1. 同名图片与 MOV/MP4 的导入配对；
2. JPEG Motion Photo 的 XMP 检测、尾部 MP4 提取与 OPFS 保存；
3. OpenFX 旧二进制与 ZIP `.livp` 双格式探测和导入，并以无压缩 UTF-8 ZIP 作为 canonical
   导出格式；
4. HEIC/HEIF 原片的本机 Worker 解码，以 JPEG 代理正常显示静态帧，同时保留原片用于下载、
   SHA-256 和 LIVP；
5. 静态图与动态片段的全窗口查看，包括桌面悬停、移动端长按、松手复位、静音和触觉反馈；
6. 实况图片可下载为原片静态帧 + MOV/MP4 的 ZIP、JPEG + MOV/MP4 的兼容 ZIP，或包含原片
   静态帧与动态片段的单文件 OpenFX LIVP；
7. JPEG EXIF 的方向、尺寸、拍摄时间、相机、镜头、曝光、评分和 GPS 解析；
8. 持久化照片分析队列，以及收藏、相册、日期和位置派生视图。

OpenFX 二进制 `.livp` 与 ZIP 容器不是同一格式，因此导入时先探测再解码。ZIP 读取支持
stored 和 deflate 条目；未知变体仍作为普通文件安全保存。这里的 `.livp` 是 OpenFX
交换格式，不应对外宣称已经支持无授权枚举 Apple Photos 图库、Quick Look 或所有第三方
变体。普通浏览器中的“Photos”入口仍由用户在系统文件选择器中明确授权具体文件，安装为 PWA
后也可接收系统分享；macOS App 则使用下面的原生 Photos 选择边界。

### macOS 版本

`domains/openfx-macos/` 使用 Perry 提供持久化 WKWebView，并在固定的
`http://127.0.0.1:15501` origin 加载当前 Web 构建。原生桥接只监听 loopback；用户点按
“Photos”后，系统 `PHPickerViewController` 只允许选择一张 Live Photo，再通过 PhotoKit
读取该资产的原始静态帧与 paired video。两个资源以流式响应交给 Web，转换为同名 `File[]`
后继续调用 `file-library-session.ts` 的既有导入入口，由同一 OPFS store 完成配对、
落盘、预览代理和后台分析。选择器由独立的 AppKit 窗口承载，不依赖 Perry WebView 暴露的
`contentViewController`；取消后原生桥会释放窗口和请求状态，因此可以立即再次打开。
主窗口保留原生红绿灯和系统窗口行为，但隐藏标题与独立标题栏；WKWebView 延伸到窗口顶部，
让系统红绿灯直接嵌入文件库 HUD 的内容背景中，并在红绿灯右侧保留透明原生拖拽区。loopback
静态服务会把 `/hlc/` 这类目录 URL 解析为目录内的 `index.html`，避免嵌入式 App 错误回退到
文件库根页面。

这实现了“一次选择完整导入”，但没有绕过系统授权，也不会枚举未选择的照片。原生资源接口
使用每次启动随机生成的 session token，不使用 base64 搬运大文件。WKWebView 与 Safari、
Chrome 各自拥有独立的物理网站数据容器，因此它们共享存储模型和代码，不共享同一份 OPFS
字节；macOS App 自身重启后会继续使用自己的持久库。

### LivpExplorer 迁移与退役结论

原 `domains/LivpExplorer/` 是从 ChronoFrame 导入并改名的独立自托管照片库，使用 Nuxt
4、Vue、SQLite/Drizzle 和独立 pnpm workspace。它从未成为 Web 首页的运行依赖。

可迁移的本地照片能力已经由 `web/src/file-library/` 和 `domains/_shared/livp-codec.ts`
接管：同名配对、Motion Photo、Live Photo 交互、EXIF/GPS、
相册/收藏/派生视图、可恢复处理任务，以及 LIVP 双格式导入和 canonical 导出均不再依赖 原
Nuxt 应用。迁入实现使用浏览器 File、Worker 和 OPFS 边界，没有复制 Vue 页面、Drizzle
模型或 SQLite 服务。

分享/reaction、账号体系、SQLite、S3/OpenList、服务端公开 URL、反向地理编码供应商和
管理后台属于另一个多用户产品，不迁入本地优先文件库。若未来需要同步，应作为可选
适配器重新设计，而不是保留对 LivpExplorer 的依赖。

迁移回归验证完成后，`domains/LivpExplorer/` 上游源码快照已于 2026-08-10 物理删除，
`deno.json` 中仅用于跳过该独立工具链的两条排除项也已移除。迁入代码的 ChronoFrame MIT
归属继续固化在根 `NOTICE`，不依赖旧目录存在。

## 仓库结构

```text
domains/          独立产品、历史项目和共享能力
  _shared/        运行时边界明确的共享算法与基础设施
  BewlyScript/    B 站桌面原站美化 userscript
  dsh-openfx/      DSH Web 五个能力包与一键组合包
  e/              运行时无关的 Agent 执行框架
  media-player/   文件库专用最小播放器
  openink/        本地优先压感绘图工作台
  openfx-macos/   Perry WKWebView 与原生 Photos 导入桥
web/              OPFS 文件库与 React + Nitro Web 产品
```

主要 domain：

| Domain                | 定位                                       | 与 Web 首页的关系        |
| --------------------- | ------------------------------------------ | ------------------------ |
| `_shared`             | 文件库 LIVP 容器编解码边界                 | 被 Web 文件库引用        |
| `BewlyScript`         | Vue userscript，输出单文件安装包           | 内置 App 与安装入口      |
| `chinagas-wms-qrcode` | WMS 物料二维码 userscript                  | 内置 App 介绍            |
| `costing-assistant`   | 浏览器本地工程计价助手                     | 动态预览 App             |
| `dsh-openfx`          | DSH Web 主题、壳层、批注、用量与浏览器套件 | 六个内置 App 介绍        |
| `e`                   | Agent core、reference runtime 与前台协议   | 内置 App 介绍            |
| `finlyzer`            | 本地优先账单分析 Electron 应用             | 动态预览 App             |
| `gasmap`              | 燃气工程单线图工具                         | 动态预览 App             |
| `hlc`                 | 圣灯社区 PWA/CMS                           | 只读同源展示 App         |
| `how-much`            | 商品价格查询与地图报告                     | Web API 与内置 App       |
| `map-poster`          | OSM 地图海报生成器                         | Web API 与内置 App       |
| `media-player`        | OPFS 视频读取、Video.js 控件和播放引擎     | 文件能力，不重复作为 App |
| `openink`             | 本地优先压感绘图、OPFS 多画稿与导出        | 动态预览 App             |
| `openfx-macos`        | Perry macOS 壳与原生 Photos Live Photo     | 复用完整 Web 文件库      |
| `wanone`              | 早期静态站点纪念项目                       | 动态预览 App             |

Web 文件库还索引 Smartisax、LiveSystem 和 WanderingPlan 等外部项目。App 的公开文案、
preview 和链接保存在 `web/content/library-apps.json`；ID、详情 renderer 与嵌入策略由
`web/library-app-catalog.ts` 统一校验。

文件库界面在手机竖屏使用固定的顶部 HUD 与下方滚动矩阵；手机横屏和桌面宽屏统一切换为
左侧固定 HUD、右侧独立滚动矩阵；搜索位于默认空间 HUD，单项操作悬浮在所选内容预览内。
两种布局都保持内容格为正方形，并支持双指缩放调整列数。

Web 入口的几个深 Module 分别承担稳定边界：

- `src/file-library/file-library-session.ts` 管理 OPFS 加载、用户 mutation、存储状态、
  私有网络创建/配对、照片/音频标签/指纹/视频缩略图队列，以及文件处理器和播放器消息；React
  首页 只订阅 snapshot；
- `src/file-library/private-mesh.ts`
  保存运行时无关的网络身份、根签名成员证书、一次性配对和 ECDH
  密钥传递；`private-mesh-key-vault.ts` 保存不可导出密钥句柄并提供 IndexedDB adapter，
  `private-mesh-recovery.ts` 负责口令加密恢复材料，`private-mesh-store.ts` 只负责独立
  OPFS 状态、v1 备份迁移和加载校验；`private-mesh-catalog.ts`
  定义受限远端目录与成员过滤， `private-mesh-catalog-store.ts`
  持久化派生目录与缩略图缓存，`private-mesh-thumbnail.ts` 在本机生成有界 WebP；
  `private-mesh-transport.ts` 负责成员签名的人工 WebRTC 信令和 DataChannel 生命周期，
  `private-mesh-transfer.ts`
  负责目录元数据、目录失效事件、派生缩略图、带逐块确认/完整性校验与取消
  协议的分块按需读取和已确认的在线 epoch 更新，`private-mesh-staged-file.ts` 负责把流式
  sink 收束为可提交、可保留续传或可丢弃的暂存状态机；OPFS store 使用双槽持久检查点、
  配额预检与 24 小时过期清理，`private-mesh-catalog-sync.ts`
  合并同一设备的密集目录刷新；
- `library-app-catalog.ts` 将 App 内容清单和 renderer 能力收成一份可校验 catalog；
- `publication-targets.ts` 是 Nitro 静态资产、Vite
  开发代理和构建前准备目标的共同事实源；
- `domains/openfx-macos/` 只负责 WKWebView 生命周期、loopback 静态服务和 PhotoKit I/O，
  导入后的文件状态与 OPFS mutation 仍由 Web session 管理；
- `domains/map-poster/src/web-service.ts` 管理地图海报输入与生成 use case，
  `viewport.ts` 管理纯 Web Mercator/瓦片计算，Web 服务层只注入 Nominatim adapter。
- `domains/openink/src/drawing-document.ts`
  保存版本化文档、原始压力点、不可变历史、变换纯函数与 `perfect-freehand`
  派生轮廓命中；`drawing-library.ts` 以不可变正文修订和双槽目录管理多画稿、原子提交与旧
  `localStorage` v1 迁移，`opfs-text-store.ts` 只适配同源 OPFS；`stroke-renderer.ts`
  复用同一轮廓并收束 SVG 导出，React 页面只处理 Pointer Events、渲染、交互编排与下载。

## 开发

前置依赖为 Deno。根目录常用命令：

```bash
deno task dev
deno task dev:client
deno task dev:server
deno task build
deno task check
```

- `dev` 先准备 HLC 与播放器静态资源，再同时启动客户端和服务端；
- `dev:client` 只启动当前源码的 Vite 客户端：`http://localhost:5501`；
- `dev:server` 只启动 Nitro API 与静态资源服务：`http://localhost:3000`；
- 日常开发应进入 5501；3000 主要供 5501 的开发代理使用，不作为前端热更新入口；
- 并行实例可分别用 `OPENFX_VITE_DEV_PORT` 与 Nitro 标准的 `PORT` 改写端口；
- 根 `deno.lock` 管理 Web 与 Deno workspace 依赖。
- 根目录和 `web/` 只以各自 `deno.json` 为配置源；根 `package.json` 与
  `package-lock.json` 已移除，并由 `deno task guard:deno-only` 防止回归。
- Web 客户端通过 Deno 脚本调用 VitePlus Core，不依赖 `vp` 对 `package.json` workspace
  的发现行为。

根 `deno.json` 同时保存 Deno Deploy 的构建与动态运行时配置。本机 Deno 2.9.5 可直接
上传当前 checkout 并创建预览 revision：

```bash
deno task deploy
```

命令从仓库根上传源码，在 Deploy 构建环境运行 `deno task build`，随后以 `web/.output`
为运行目录、`server/index.ts` 为动态入口。Nitro 使用 Deno 文件系统静态
资源处理器读取同目录下的 `public/`，避免把大型 Worker、WASM 和媒体资源内联进 server
entry 而拖慢 Deploy warm-up。根配置固定发布到 `universes/openfx`；只有明确准备切换生产
流量时才追加 `--prod`。CI 或 Agent 使用 `DENO_DEPLOY_TOKEN`，并追加
`--json --non-interactive`。

`domains/media-player/.openfx-public/` 保存最小播放器的确定性发布快照。普通开发和 GitHub
CI 会从 domain 源码重新构建它，CI 同时检查快照无差异；Deno Deploy 直接复用该
快照，避免在 3 GiB builder 中再次运行独立 pnpm 安装。

这里的“统一”为根产品工具链收口，不是删除所有 domain 的独立构建边界。下列产品仍由其
自身配置和工具链构建；需要包清单或独立锁文件的上游项目继续保留：

独立工具链：

| 范围                   | 常用命令                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `domains/BewlyScript`  | `bun install`、`bun run dev`、`bun run check:userscript`                                  |
| `domains/dsh-openfx`   | `pnpm install`、`pnpm test`、`pnpm typecheck`、`pnpm build`                               |
| `domains/media-player` | `deno run --no-config -A openfx/build.ts`、`deno run --no-config -A npm:pnpm@9.15.9 test` |
| `domains/map-poster`   | `bun test`、`bun run typecheck`                                                           |
| `domains/finlyzer`     | `pnpm dev`、`pnpm dist:win`                                                               |
| `domains/openink`      | `deno task check`、`deno task build`                                                      |
| `domains/openfx-macos` | `bun install`、`bun run check`、`bun run build`                                           |

### Web 服务边界

公开入口包括：

- `GET /api/health`
- `/api/how-much/*`
- `POST /api/map-poster/render`
- `/media-player/*`
- `/hlc/*`
- `/openink/*`

Map Poster 生产环境需要：

- `OPENFX_MAP_POSTER_NOMINATIM_SEARCH_URL`
- `OPENFX_MAP_POSTER_NOMINATIM_REVERSE_URL`

生产构建使用有界 Deno 入口：请求体在进入 Nitro 前限制为 64 KiB，并使用运行时真实远端
地址覆盖外部伪造的转发地址。

### 特殊模块

- `media-player` 只保留 OPFS 读取、字幕、续播、Video.js 10 控件以及 `playsvideo@0.4.7`
  的直通、解封装、分段和必要音频转码。完整 PlaysVideo domain 已物理删除；固定引擎保存在
  vendor 包中。
- HLC Web 展示只复制地图和艺术资产，不发布认证、内容工作流或写入接口。修改
  `domains/hlc/source/index.html` 后运行：

  ```bash
  deno run --no-config --allow-read --allow-write domains/hlc/tools/build-display-app.ts
  ```
- BewlyScript 只交付 userscript，不恢复 WebExtension popup/options/商店打包。
  `m.bilibili.com` 只显示请求桌面站提示，不挂载主 Vue App。
- `domains/e` 的 core 必须保持运行时无关；文件系统、模型、Git、MCP 和副作用通过接口
  注入，危险动作经过 `SafetyActionGate`。
- `domains/openink` 以原始压力点作为画稿事实，`perfect-freehand`
  只负责生成可重算的轮廓；选择移动与缩放只修改变换。画稿库在同源 OPFS
  中保存不可变正文修订与双槽目录，支持缩略图列表、新建、重命名、复制和原子恢复；首次打开
  会在 OPFS 成功吸收后迁移并清除旧 `localStorage` v1 单画稿；兼容存储产生的新稿也会在
  OPFS 恢复后先并入现有画稿库。用户显式选择的纸张照片会以原始字节留在本机，并通过手动
  四角透视、背景/阴影清理、阈值、降噪和粗细控制生成可重建蒙版与 SDF；套索可整笔选择原生
  笔画，并把圈内照片墨迹切成可统一移动、缩放和删除的片段。墨水、铅笔、粉笔和蓝图是画稿级
  统一材质。SVG 是 canonical 导出，PNG 由包含照片墨迹的 SVG 本机派生；尚未实现自动边缘
  识别、旋转、逐图层材质、整张画稿删除、标签或云同步。
- `domains/openfx-macos` 的 `bun run build` 会先构建并暂存 Web 公共资源，校验 Perry 与
  Swift/C ABI 桥，产出 ad-hoc Hardened Runtime 签名的
  `dist/OpenFX.app`；正式分发仍需单独 配置 Developer ID、notarization 或 App Store
  签名。

## 文档约定

项目源码只维护两份 Markdown 文档：

- `README.md`：面向人的产品、架构、运行和迁移说明；
- `AGENTS.md`：面向开发 Agent 的工作约束与验证规则。

不要新增 domain 级 README、AGENTS、SKILL、历史计划或设计 QA 文档；相关有效信息应归并
到上述两份文件。LICENSE、NOTICE、代码注释、API 类型和测试不属于此限制。

## 清理记录

- 历史 Perry 桌面端、Proxy、Downip、LivpExplorer 与完整 PlaysVideo domain 已移除；新的
  `openfx-macos` 只承载当前文件库的 WKWebView 和原生 Photos 导入，不恢复旧桌面产品；
- PlaysVideo 仍被使用的最小发布引擎已固定在 `domains/media-player/vendor/`；
- `_shared` 中没有产品调用的历史工具已删除；只服务 `how-much` 的 KV adapter 已回归其
  domain，`livp-codec.ts` 按文件库事实边界保留；
- 历史设计稿、重复上游说明和旧清理报告已在文档收口时删除。

## 协议与来源

仓库主体使用 Apache-2.0，见 `LICENSE` 与 `NOTICE`。包含独立许可证的 domain
继续以各自目录中的 LICENSE 为准。主要上游来源包括 BewlyCat/BewlyBewly、
ChronoFrame、maptoposter 和 playsvideo；保留其源码许可与第三方声明。
