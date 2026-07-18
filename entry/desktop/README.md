# OpenFX Node（Perry 桌面端）

OpenFX Node 是常驻 macOS 菜单栏的原生 Perry 应用。它接管原 Freemac Core 的本机监控、IPv6
节点、Relay 上报和受审批 Agent 工具能力，不依赖 Bun、Elysia、Electron 或 Tauri。

## 运行边界

- Perry 使用 `appSetActivationPolicy("accessory")`、单个主窗口和 Tray；关闭主窗口只隐藏
  界面，Tray 会通过 Perry 原生 selector 重新显示同一个窗口，节点服务与 5
  秒采样继续运行。
- 节点 API 监听 `[::]:24531`。公开 `/v1/health` 只返回健康状态和协议版本，
  其余固定路由统一经过 v1 签名、AES-GCM 信封、时间窗和 nonce 防重放校验。
- 配对使用 OpenFX 服务端 URL 与 8 位配对码。普通偏好只保存非敏感节点信息， `nodeSecret`
  存入 macOS Keychain 的 `OpenFX Node` service。
- 公网 IPv6 只从两个固定 HTTPS
  观察端点确认，并且必须与本机候选地址匹配；不匹配和观察错误 会显式保留在网络状态中。
- OpenFX 控制面上报只走 `node:https.request`，包括实时 Agent delta 与审批事件；OMLX
  固定使用 `node:http.request` 流式访问 `127.0.0.1:8000/v1/chat/completions`。
- Agent 工具是封闭的 v1 清单。三个有副作用的工具必须经过 `domains/e` 的
  `SafetyActionGate`。审批、执行意图/结果、审计和 Relay nonce 使用同一个 SQLite 事务
  journal；不完整执行在重启时终止为 `ambiguous`，不会重放原生副作用。
- journal 写入 `~/Library/Application Support/OpenFX Node/journal.sqlite`，使用
  `BEGIN IMMEDIATE`、WAL 与 `synchronous=FULL`；首次启动会事务迁移旧
  JSONL，并清理已废弃的 `.lock` 文件。目录权限固定为 `0700`，数据库/WAL 文件固定为
  `0600`。Keychain 密钥通过 标准输入写入，不出现在进程参数中。

## 验证

```bash
deno task --config entry/desktop/deno.json test
perry check entry/desktop/src/main.ts --deep-deps
perry compile entry/desktop/src/main.ts -o dist/openfx-desktop
```
