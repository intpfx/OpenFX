# OpenFX Node（Perry 桌面端）

OpenFX Node 是常驻 macOS 菜单栏的原生 Perry 应用。它接管原 Freemac Core 的本机监控、IPv6
节点、Relay 上报和受审批 Agent 工具能力，不依赖 Bun、Elysia、Electron 或 Tauri。

## 运行边界

- Perry 使用 `activationPolicy: "accessory"` 和 Tray；窗口隐藏后节点服务与 5
  秒采样继续运行。
- 节点 API 监听 `[::]:24531`。公开 `/v1/health` 只返回健康状态和协议版本，
  其余固定路由统一经过 v1 签名、AES-GCM 信封、时间窗和 nonce 防重放校验。
- 配对使用 OpenFX 服务端 URL 与 8 位配对码。普通偏好只保存非敏感节点信息， `nodeSecret`
  存入 macOS Keychain 的 `OpenFX Node` service。
- OpenFX 控制面上报只走 `node:https.request`；OMLX 固定使用 `node:http.request` 访问
  `127.0.0.1:8000/v1/chat/completions`。
- Agent 工具是封闭的 v1 清单。三个有副作用的工具必须经过 `domains/e` 的
  `SafetyActionGate`，审批权威和待审批请求都会持久化。
- 审计记录追加写入 `~/Library/Application Support/OpenFX Node/audit.jsonl`。

## 验证

```bash
deno task --config entry/desktop/deno.json test
perry check entry/desktop/src/main.ts --deep-deps
perry compile entry/desktop/src/main.ts -o dist/openfx-desktop
```
