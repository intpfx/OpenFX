# OpenFX Node（Perry 桌面端）

OpenFX Node 是常驻 macOS 菜单栏的原生 Perry 文件管理器和节点。主窗口以封面墙管理用户
主动导入的文件；菜单栏承载本机监控、IPv6、Relay、Agent 与上报状态。它不依赖
Bun、Elysia、 Electron 或 Tauri。原 Freemac Core 和独立 Dashboard
已在真实组合门通过后删除。

## 运行边界

- Perry 0.5.1220 稳定策略暂时固定为 `accessory` 菜单栏后台模式；已保存的 `launchMode`
  继续保留以兼容未来版本，但当前切换控件不可操作。Tray 通过 Perry 原生 selector 显示同一
  主窗口，关闭窗口不退出节点；服务始终继续运行。系统快照在服务启动时采集一次，并在窗口
  激活、手动刷新或配对检查时按需更新。节点连接、服务、网络、Relay、Agent 和上报时间只
  显示在菜单栏，不占用文件管理窗口。
- Perry 0.5.1220 的生产窗口完全不创建 `Canvas`，继续避开已确认的原生 IOAccelerator
  风险。文件封面墙由原生 `ScrollView`、`ZStack`、`ImageFile` 和短时透明度过渡组成，
  不使用连续帧循环；`reduceMotion` 只控制文件详情层的短过渡。CPU、内存等遥测随启动
  与用户事件按需采样和上报，后台不会持续重建原生对象。Canvas 渲染器仅为未来能力保留；
  通过原生内存门禁后才能重新启用。
- 主窗口使用透明的 `overlay` 标题区，内容延伸到窗口顶部，原生交通灯直接沉入内容层；
  不绘制自定义交通灯，也不保留独立标题栏。
- 节点 API 监听 `[::]:24531`。公开 `/v1/health` 只返回健康状态和协议版本，
  其余固定路由统一经过 v1 签名、AES-GCM 信封、时间窗和 nonce 防重放校验。
- 配对使用 OpenFX 服务端 URL 与 8 位配对码。普通偏好只保存非敏感节点信息以及 Relay
  开关、`launchMode`、`reduceMotion`；所有偏好写入都以同步的局部补丁合并最新
  持久化值，因此 HTTPS 或 Keychain 尚未完成时更改这些选项也不会被配对完成覆盖。异步
  配对或恢复返回后，UI、Relay 与事件上报器统一从该同步权威源重建；Keychain 读取期间
  `nodeId` 变化会安全拒绝旧凭据，同时保留期间已完成的新配对。`nodeSecret` 存入 macOS
  Keychain 的 `OpenFX Node` service，成功后已消费的配对码立即从原生文本框清除。
  偏好写入抛错时会恢复提交前的序列化快照，只有持久化成功后才更新进程内 UI 状态；若恢复
  本身也失败，界面会明确要求重启后检查设置。
- 本机 CPU、内存、进程和网络候选地址在启动时采样一次，之后由窗口激活、手动刷新和配对
  检查触发；公网 IPv6 只从两个固定 HTTPS 观察端点确认，外部结果缓存 1 分钟且并发采样复用
  同一个 in-flight。每次本地采样仍用最新
  候选地址重新匹配；不匹配和观察错误会显式保留在网络状态中。
- 长时诊断确认，根因是 5 秒系统轮询在 Perry 中反复解析 `top`、`netstat` 等文本并构造新
  对象图。最小 Perry UI、完整静态 UI、空 `setInterval`、`execFile(true)` 以及丢弃输出的
  `top` 都稳定；只启动 `systemMonitor` 即复现约 8 MiB/分钟的 IOAccelerator 驻留增长。
  Activity Monitor 的巨大“内存”不是同等大小的实时物理占用，而是 Perry arena 长期保留并
  继续扩展的原生页。生产节点因此取消无人值守的 5
  秒轮询，改为启动一次和用户事件驱动的完整 快照；HTTP、Agent、Relay
  和手动采样能力不变。固定 Perry 补丁仍为安静 HTTP/ext-net pump
  提供无分配快路径，作为独立的原生分配防线。
- 常规采样仍主动限制原生边界的输出量：进程数据复用 `top` 第二帧；IPv6 候选按事件读取
  `ifconfig` 的完整接口地址，以包含 macOS 实际用于出站的隐私临时地址，再与外部 HTTPS
  观察结果严格匹配。`top` 两帧间隔 1 秒，按 CPU 排序并最多保留 100 条进程诊断；摘要仍
  提供真实系统进程总数。仅审批后的进程终止会按 PID 单次调用
  `ps`，用于副作用前的身份复核。
- 已配对节点在每次事件驱动采样后尝试签名 heartbeat 与 telemetry；1 分钟节流同时覆盖成功
  与失败，避免频繁激活时重复公网请求。重新配对或切换权威配对状态会重置该节奏。
- OpenFX 控制面上报只走 `node:https.request`，包括实时 Agent delta 与审批事件。本机
  loopback HTTPS 在没有显式 `NODE_EXTRA_CA_CERTS` 时，仅对 `localhost`、`127.0.0.1` 和
  `::1` 从 `CAROOT` 或 macOS 默认 mkcert 目录加载根证书；公网与生产主机不会隐式获得这条
  本地 CA。OMLX 固定使用 `node:http.request` 流式访问
  `127.0.0.1:8000/v1/chat/completions`。
- Agent 工具是封闭的 v1 清单。三个有副作用的工具必须经过 `domains/e` 的
  `SafetyActionGate`。审批、执行意图/结果和审计使用追加式 SQLite journal；Relay nonce
  使用同一数据库中独立的带过期索引键表，不写入或扫描审计 journal。不完整执行在重启时
  终止为 `ambiguous`，不会重放原生副作用。
- OMLX 工具调用使用最多 3 轮、12 次的有界回送闭环；工具结果受总字节预算控制，最终模型
  回答才写入会话。全部轮次共享 30 秒绝对截止时间，Relay 断开会取消 OMLX 和剩余工具轮次，
  且不写入被取消的 turn。节点只保留最近 30 条且最多 240 KiB 的 Agent 历史。
- journal 写入 `~/Library/Application Support/OpenFX Node/journal.sqlite`，使用
  `BEGIN IMMEDIATE`、WAL 与 `synchronous=FULL`；首次启动会事务迁移旧 JSONL，也会把旧
  `replay.claimed` 事件一次性迁移到有界 nonce 表。nonce claim 通过 `BEGIN IMMEDIATE`
  和主键在多进程间只成功一次，并在每次 claim 时按 TTL 清理过期项，
  不删除追加式审计。迁移事务同时安装持久写入栅栏；仍在运行的旧版本若尝试追加
  `replay.claimed` 会失败关闭，不能与新 nonce 表形成两个权威来源。初始化会清理已废弃的
  `.lock` 文件；并发冷启动遇到 SQLite busy/locked
  时会有界抖动重试，其他初始化错误立即返回。目录权限固定为 `0700`；数据库/WAL 文件固定
  为 `0600`。Keychain 只通过固定的 `/usr/bin/security`、参数数组和 `shell: false`
  访问，不经过 Shell 插值。

## 文件管理界面

- 文件墙不是本机目录浏览器。用户从原生文件选择器导入文件后，OpenFX Node 会先把内容复制
  到 `~/Library/Application Support/OpenFX Node/Files`，再只索引和操作这份应用自管副本。
  导入成功后，原文件被移动或删除不会影响文件墙中的管理副本。
- 文件墙收录所有导入的文件类型，而不局限于照片和视频。`.app`、`.bundle`、
  `.framework`、`.kext`、`.pkg` 和 `.plugin` 作为单个应用包管理；图像直接读取，视频、
  音频、文档、压缩包、代码和其他 macOS 可预览类型通过 Quick Look 生成缩略图；无法生成
  缩略图时按文件类型显示稳定的图标与扩展名封面。
- 同名文件不会覆盖已有内容，后续导入会获得带序号的管理名称。复制先写入隐藏的临时项，
  完成后再原子进入文件墙，失败的半成品不会显示。
- Quick Look 任务最多并发 2 个，派生缩略图按管理路径、大小和修改时间缓存到
  `~/Library/Caches/OpenFX Node/Thumbnails`。管理副本和缩略图都只保存在本机，不上传。
- 单击图像或视频会在当前窗口进入 Photos 式沉浸查看层：图像保持比例完整适配窗口，视频
  使用原生 `AVPlayerView` 和悬浮播放控件；工具栏返回按钮回到文件墙。非媒体文件仍显示
  详情，并可用系统默认应用打开或在 Finder 中定位应用管理的副本。当前版本不提供重命名、
  移动或删除。
- 封面本身不常驻文件名和元数据；鼠标经过时由底部悬浮操作条显示当前文件信息。1–6 个文件
  使用 200×150 的紧凑矩形，最多每行 3 个，卡片横纵无间隙；卡片之外透出窗口原生
  `underWindowBackground` 磨砂材质，不绘制不透明黑底。7–24 个文件才自适应铺满窗口， 其中
  24 个文件形成 4 行 × 6 列的连续封面墙。超过 24 个后保持同一四行可视节奏并允许
  纵向滚动。
- 文件管理窗口右上角只保留导入、刷新和打开应用自管文件库三个纯图标操作，不绘制按钮背景、
  圆角、阴影或聚焦底色。节点配对与界面偏好从菜单栏的“节点配对与设置…”打开独立设置
  窗口；CPU、内存、网络、Relay、Agent 和上报状态只在 macOS 菜单栏中展示。

## Perry 原生库

稳定版 Perry 0.5.1220 需要仓库内的最小补丁，以修复外部 HTTP 静态库的 stdlib 符号边界、
IPv6 listen 地址格式、小整数 handle 被 Set 当成 GC 字符串指针，以及 `ClientRequest`
分派和长期生命周期回收问题。补丁固定在
[`perry/perry-v0.5.1220-openfx.patch`](perry/perry-v0.5.1220-openfx.patch)，构建脚本会校验
官方 tag 的精确提交，并在套补丁前拒绝错误提交、已修改文件和未跟踪文件。

```bash
git clone --depth 1 --branch v0.5.1220 https://github.com/PerryTS/Perry.git /tmp/perry-openfx
rustup toolchain install 1.96.1
deno task perry:runtime --source /tmp/perry-openfx
export PERRY_LIB_DIR=/tmp/perry-openfx/target/openfx-v0.5.1220/release
```

Perry UI 的 AppKit timer 持续驱动 async reactor、stdlib 与 HTTP/HTTPS pump。补丁为
`node:http` 增加无分配的待处理工作检查，并为 ext-net 增加空队列快路径；安静监听只保持
事件循环存活，不再触发每 8 ms 一次的 handle 快照或 scratch-buffer 循环。有真实事件时，
HTTP/HTTPS/HTTP2 handle ID 使用可重入的复用缓冲区完成快照，不再逐 tick 创建临时 `Vec`；
ext-net 的原子 pending hint 让空闲 tick 无需读取队列锁。挂起响应先走轻量 reaper，并不
单独开启全量 pump。request/response、raw upgrade 和 handle quarantine
仍沿原路径处理。窗口隐藏只取消 Canvas frame callback，不停止节点。空 Tray 图标路径由
Perry 直接映射为原生实心圆点 `●`，不解析应用包资源。构建完成后，
`PERRY_LIB_DIR/openfx-perry-runtime-provenance.json` 记录精确 Perry 提交、Rust
1.96.1、补丁 SHA-256 和 Perry CLI/四个静态库的 SHA-256。应用构建、应用 smoke 与组合
smoke 都会重新校验 manifest 和实际文件；缺失或篡改会直接失败。由于源码在
构建中会应用补丁，下一次 `perry:runtime` 必须使用新的干净 clone。

## 构建 macOS 应用

桌面端人工验收和日常运行统一使用 `dist/OpenFX Node.app`，不再直接运行临时裸二进制。
构建器只接受 provenance 验证通过的固定 Perry CLI 和静态库，并在签名前完成以下工作：

- 生成 arm64-only Mach-O，并把部署目标锁定为 macOS 13.0；
- 生成 Bundle ID 为 `com.openfx.node` 的 `Info.plist`；
- 从 OpenFX 512 px 产品图标生成 `OpenFXNode.icns`；
- 保留 Perry 原生空路径 Tray 契约，由 macOS 状态栏显示实心圆点 `●`，应用包不携带 Tray
  图片资产；
- 使用本机 ad-hoc 身份签名并校验完整应用包。

```bash
deno task desktop:app
open "dist/OpenFX Node.app"
```

本地包没有 Developer ID 和公证票据，仅用于本机开发与验收；正式分发签名不在当前构建任务
范围内。

## 验证

```bash
deno task --config entry/desktop/deno.json test
perry check entry/desktop/src/main.ts --deep-deps
deno task desktop:app
deno task desktop:app-smoke
deno task desktop:memory-smoke
deno run --unstable-kv -A entry/desktop/tools/console-integration-smoke.ts
```

`desktop:app-smoke` 从 `.app` 经 Launch Services 启动真实主应用，验证 arm64、macOS 13
部署目标、`Info.plist`、ad-hoc 签名、bundle 内 Tray 像素透明度、
`[::1]:24531/v1/health`、原生截图和清洁退出。每次 smoke 都使用唯一 token；真实应用写出
PID/可执行路径和退出哨兵，测试再用 `ps` 与 `lsof` 核验它确实是当前 bundle 实例。超时清理
先向该 bundle 发送原生 Quit Apple Event，失败后才会终止这个已核验 PID。普通模式会在实例
核验后显式显示窗口并截图；内存模式保持真实菜单栏后台运行，避免自动化激活干扰长时样本。

`desktop:memory-smoke` 要求已经通过 provenance 校验的固定 Perry 0.5.1220
运行库和构建好的 `dist/OpenFX Node.app`。它复用同一 token/PID/可执行文件核验，启动后预热
30 秒。预热后的首个快照作为基线，之后每 30 秒采样一次，采样窗口持续 10 分钟。门禁要求：

- IOAccelerator region 数量增量 `<= 0`；
- IOAccelerator 虚拟内存增量 `<= 64 MiB`；
- IOAccelerator resident 增量 `<= 16 MiB`；
- 物理 footprint 增量 `<= 96 MiB`。

缺失任一字段都会 fail closed，并输出基线、峰值、最终及失败快照。

最后一条是真实本机组合门，覆盖受信任 HTTPS 配对、Keychain、真实公网 IPv6 health、
签名上报、固定 Relay、SSE 续接、OMLX 离线降级和审批执行/拒绝/过期/重放闭环。
