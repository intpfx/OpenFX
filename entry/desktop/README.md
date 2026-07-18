# OpenFX Node（Perry 桌面端）

OpenFX Node 是常驻 macOS 菜单栏的原生 Perry 节点候选实现。它用于接管原 Freemac Core
的本机监控、IPv6 节点、Relay 上报和受审批 Agent 工具能力，不依赖 Bun、Elysia、Electron
或 Tauri。

当前不能完成生产接管：Perry 0.5.1220 编译产物的 `node:http.request`、
`node:https.request` 和保持证书校验的 `node:tls.connect` 均不发起网络 I/O。静态检查和
编译可以通过，但真实 HTTPS 配对门失败，因此 `domains/freemac` 必须继续保留。详见
[`../../docs/openfx-console-architecture.md`](../../docs/openfx-console-architecture.md)。

## 运行边界

- Perry 使用 `appSetActivationPolicy("accessory")`、单个主窗口和 Tray；关闭主窗口只隐藏
  界面，Tray 会通过 Perry 原生 selector 重新显示同一个窗口，节点服务与 5
  秒采样继续运行。
- 节点 API 监听 `[::]:24531`。公开 `/v1/health` 只返回健康状态和协议版本，
  其余固定路由统一经过 v1 签名、AES-GCM 信封、时间窗和 nonce 防重放校验。
- 配对使用 OpenFX 服务端 URL 与 8 位配对码。普通偏好只保存非敏感节点信息，`nodeSecret`
  存入 macOS Keychain 的 `OpenFX Node` service。
- 公网 IPv6 只从两个固定 HTTPS
  观察端点确认，并且必须与本机候选地址匹配；不匹配和观察错误 会显式保留在网络状态中。
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
  为 `0600`。Keychain 密钥通过标准输入写入，不出现在进程参数中。

## 验证

```bash
deno task --config entry/desktop/deno.json test
perry check entry/desktop/src/main.ts --deep-deps
perry compile entry/desktop/src/main.ts -o dist/openfx-desktop
deno run --unstable-kv -A entry/desktop/tools/console-integration-smoke.ts
```

最后一条是真实本机组合门，目前会在编译后 Perry 节点的 HTTPS 配对阶段失败。只有该命令
完整覆盖 Keychain、IPv6 Relay、签名上报、OMLX 降级和审批闭环后，才能删除旧 Freemac
运行时。
