# OpenFX Node（Perry 桌面端）

OpenFX Node 是常驻 macOS 菜单栏的原生 Perry 节点。它承载本机监控、IPv6 节点、Relay
上报和受审批 Agent 工具能力，不依赖 Bun、Elysia、Electron 或 Tauri。原 Freemac Core
和独立 Dashboard 已在真实组合门通过后删除。

## 运行边界

- Perry 默认使用 `regular` Dock 模式、单个主窗口和 Tray；用户选择的 `menuBarOnly`
  只在下次启动时切换为 `accessory`。关闭主窗口会清除待处理绘制帧，Tray 或 Dock 通过
  Perry 原生 selector 重新显示同一窗口并恢复 24 FPS Canvas；节点服务与 5
  秒采样始终继续运行。`menuBarOnly` 冷启动在原生窗口可见前保持零 Canvas 绘制；静态核心
  也遵循同一 visibility 边界。
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
- 本机 CPU、内存、进程和网络候选地址每 5 秒采样；公网 IPv6 只从两个固定 HTTPS
  观察端点确认，外部结果缓存 1 分钟且并发采样复用同一个 in-flight。每次本地采样仍用最新
  候选地址重新匹配；不匹配和观察错误会显式保留在网络状态中。
- 已配对节点的签名 heartbeat 与 telemetry 每分钟最多尝试一组；失败尝试也进入 1 分钟
  节流窗口，避免控制面不可用时退化为每 5 秒两次公网请求。重新配对或切换权威配对状态会
  重置该节奏。
- OpenFX 控制面上报只走 `node:https.request`，包括实时 Agent delta 与审批事件；OMLX
  固定使用 `node:http.request` 流式访问 `127.0.0.1:8000/v1/chat/completions`。
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

Perry UI 的 AppKit timer 持续驱动 async reactor、stdlib 与 HTTP/HTTPS pump。完成的 HTTP
request/response 会保留到 terminal 回调后的下一次 pump，再从注册表移除并进入 handle
quarantine；窗口隐藏只取消 Canvas frame callback，不停止节点。Tray 相对图标先解析
`.app/Contents/Resources`，再回退到
可执行文件目录。构建完成后，`PERRY_LIB_DIR/openfx-perry-runtime-provenance.json`
记录精确 Perry 提交、Rust 1.96.1、补丁 SHA-256 和 Perry CLI/四个静态库的
SHA-256。应用构建、应用 smoke 与组合 smoke 都会重新校验 manifest
和实际文件；缺失或篡改会直接失败。由于源码在 构建中会应用补丁，下一次 `perry:runtime`
必须使用新的干净 clone。

## 构建 macOS 应用

桌面端人工验收和日常运行统一使用 `dist/OpenFX Node.app`，不再直接运行临时裸二进制。
构建器只接受 provenance 验证通过的固定 Perry CLI 和静态库，并在签名前完成以下工作：

- 生成 arm64-only Mach-O，并把部署目标锁定为 macOS 13.0；
- 生成 Bundle ID 为 `com.openfx.node` 的 `Info.plist`；
- 从 OpenFX 512 px 产品图标生成 `OpenFXNode.icns`；
- 从可审查的 SVG 源生成四角透明、单色 FX Tray 模板图标；
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
deno run --unstable-kv -A entry/desktop/tools/console-integration-smoke.ts
```

`desktop:app-smoke` 从 `.app` 经 Launch Services 启动真实主应用，验证 arm64、macOS 13
部署目标、`Info.plist`、ad-hoc 签名、bundle 内 Tray 像素透明度、
`[::1]:24531/v1/health`、原生截图和清洁退出。每次 smoke 都使用唯一 token；真实应用写出
PID/可执行路径和退出哨兵，测试再用 `ps` 与 `lsof` 核验它确实是当前 bundle 实例。超时清理
只会终止这个已核验 PID。最后一条是真实本机组合门，覆盖受信任 HTTPS 配对、Keychain、
真实公网 IPv6 health、签名上报、固定 Relay、SSE 续接、OMLX 离线降级和审批
执行/拒绝/过期/重放闭环。
