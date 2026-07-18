# OpenFX 控制台架构与运维

OpenFX 控制台的目标架构由三个边界清晰的部分组成：Nitro/Deno Deploy 控制面、Perry 原生
Mac 节点，以及运行时无关的 `domains/e` Agent/审批内核。Web 控制面、共享协议和 Perry
节点候选实现已落地，但旧 Freemac Bun/Elysia Core 与独立 Dashboard 尚未删除。

当前迁移状态是 **BLOCKED**：Perry 0.5.1220 能静态检查并编译 `node:http`、`node:https` 和
`node:tls`，但原生可执行文件对 loopback 与公网端点都不发起客户端网络 I/O，也不触发
响应或错误回调。真实 HTTPS 配对、Relay 和审批闭环因此没有通过。按删除门禁，生产切换和
Freemac 清理必须等待 Perry 修复后重新验证。

## 运行边界

- `entry/web` 提供 `/admin`、管理员会话、配对、Deno KV 历史、SSE 和固定 Relay。
- `entry/desktop` 是目标 Mac 节点。它以 Perry accessory 应用常驻菜单栏，监听
  `[::]:24531`，关闭窗口不停止节点服务。
- `domains/e` 只提供工具执行与 `SafetyActionGate`，不依赖 Perry、Nitro、Bun 或 Web UI。
- OMLX 只允许 `127.0.0.1:8000/v1`；OMLX 不可用时 Agent 显示离线，监控、Relay
  和手动审批仍然工作。

## 必填环境变量

生产部署必须同时设置：

- `OPENFX_ADMIN_KEY`：单管理员登录密钥。生产环境没有该值时登录会失败关闭。
- `OPENFX_NODE_CREDENTIAL_KEY`：32 字节文本或 32 字节 Base64URL。它只用于在 Deno KV 中以
  AES-256-GCM 加密节点凭据副本，不能与管理员密钥复用。

建议把两者保存在 Deno Deploy 的加密环境变量中，不写入仓库、构建日志、浏览器存储或
命令行参数。Web 构建不需要知道它们，只有服务端运行时读取。

## 会话、配对与密钥

1. 管理员通过 `POST /api/admin/session` 登录，获得 12 小时绝对有效的 `HttpOnly`、
   `SameSite=Strict` cookie；生产 cookie 同时带 `Secure`。
2. 控制台生成 8 位 Crockford Base32 配对码。配对码逻辑有效期为 10 分钟，并通过 Deno KV
   原子事务保证只能消费一次；10 分钟 live marker 与消费事务一起校验，11 分钟 grace
   record 的最后 1 分钟只用于保留 `node_pairing_expired` 错误语义。消费事务先写入显式
   `incomplete` 状态和旧节点状态快照，最终化 CAS 再把它改为 `completed`，但在 grace
   record 生命周期内保留快照。`incomplete` 不设置物理 TTL，以免存储故障期间恢复依据先于
   临时节点丢失；完成或补偿后才恢复短 TTL。CAS 返回后的第一步是同步检查绝对
   截止时间；若调用期间跨过边界，服务端会用带版本和所有权检查的补偿事务移除临时凭据、
   恢复旧状态并返回 `node_pairing_expired`，不会返回 `nodeSecret`。成功的截止检查与
   secret 响应之间不再执行存储 I/O。Deno KV 不能把服务端墙钟比较纳入原子提交，
   因此这里的边界定义为 CAS 返回后立即观察到的时间。若最终化存储失败，grace record
   会保持 `incomplete`；后续同码请求先幂等清理临时节点，未过期时恢复 live marker 并以新
   secret 重新配对，已过期时返回 410。`completed` 重放始终返回
   `node_pairing_used`，不会补偿或移除已成功的活动节点。
3. Perry 节点通过 HTTPS 提交配对码和经本机、外部观察共同确认的公网 IPv6。服务端只在
   配对响应中返回一次 32 字节 `nodeSecret`。
4. 节点把 secret 写入 macOS Keychain 的 `OpenFX Node` service；普通偏好只保存
   `nodeId`、节点名、服务端 URL、Relay 开关和配对时间。
5. 服务端只保存校验摘要和由 `OPENFX_NODE_CREDENTIAL_KEY` 加密的凭据副本。浏览器 API
   不返回 secret、摘要、密文或解密结果。

配对完成后的心跳、遥测和节点事件不会发送 secret。每个请求签名覆盖协议版本、精确 HTTP
方法、固定路径、规范化 body 摘要、时间戳和随机 nonce；服务端解密凭据后校验 HMAC，并把
nonce 消费与权威业务写入放在同一个 Deno KV 原子事务中。时间窗外、跨路由复用、body
篡改、凭据撤销后重放和重复 nonce 都会被拒绝。nonce 记录保存在 Deno KV，防重放
不依赖单个进程内存，因此跨实例和重启仍然有效。

## Relay 与 Agent

云端 Relay 不接收目标 URL。它只能访问当前活动节点记录中的公网 IPv6 和固定端口
`24531`，并且只允许共享协议中列出的 v1 路由。云端到节点的 Relay 使用 HKDF、
AES-256-GCM、HMAC-SHA256、时间戳和双层 nonce；节点以 SQLite 主键 TTL 表持久化防重放
状态，claim 不写入或扫描追加式审计 journal，旧 `replay.claimed` 事件只迁移一次。迁移
事务会安装持久 trigger，拒绝仍在运行的旧版本继续写入 legacy claim，避免混合版本下出现
两个 nonce 权威来源；其他 journal 和 audit 事件不受影响。
节点的加密回包必须回显已签名请求的 nonce、HTTP 方法和固定路径，控制面认证信封后逐项
校验关联信息，再只向浏览器返回结果。Relay HTTP 响应按流读取并硬限制为 64 KiB，超限时
立即取消读取，不进入 JSON 或密码学验证。控制面在发出网络请求前先持久化 `relay.intent`
审计；结果审计为尽力追加，因此外部效果成功后即使审计存储短暂失败，已有意图证据仍保留。

只读工具可以直接执行：系统概览、进程列表、网络状态、Relay 状态和审计查询。终止进程、
打开允许列表内的应用和修改 Relay 开关必须审批。审批保存工具参数指纹和 5 分钟过期时间；
批准、拒绝、过期和已消费状态都不可重复应用。v1 没有任意 Shell、任意文件读写或任意 URL
请求工具。

## 数据与事件

- Perry 每 5 秒采样一次；云端按分钟聚合遥测，保留最近 7 天。
- SSE 事件包含 `heartbeat`、`telemetry`、`agent.delta`、 `approval.requested` 和
  `approval.resolved`，支持 `Last-Event-ID` 续接。
- 节点事件批次具有请求级幂等性；失败不会留下半批事件，安全重试也不会重复追加。
- 控制面审计是追加式数据，不使用遥测 TTL。审计接口按最新优先分页返回。
- Perry 本地审批、执行和审计写入 SQLite journal，目录权限 `0700`，数据库/WAL 权限
  `0600`。

旧 Freemac Core 的审计位置是
`${FREEMAC_DATA_DIR:-<旧 Core 工作目录>/.data}/state/audit.ndjson`，每行是
`{id,category,action,status,payload,createdAt}`。仓库迁移时没有发现实际审计文件；如果旧机器
上存在该文件，应原地只读留档。它不会导入 OpenFX 遥测库，也不会套用 7 天 TTL。

## 控制台渲染降级

宽屏、未请求减少动态效果且图形能力可用时，核心总览使用真实 WebGL 渲染。WebGL 初始化
失败、窄屏、`prefers-reduced-motion` 或低功耗模式会切换为静态 DOM/2D 核心。降级只影响
视觉层，数据库、访问规则、Relay、Agent 和审批工作台保持可用。

## 撤销、轮换与恢复

### 撤销或轮换节点凭据

1. 在“设置”中撤销节点，或调用 `DELETE /api/console/node`。该事务同时删除活动节点、
   云端加密凭据和在线状态；旧 secret 立即失效。
2. 在 Mac 上删除旧 Keychain 项：

   ```bash
   /usr/bin/security delete-generic-password -s "OpenFX Node" -a "<旧 nodeId>"
   ```

3. 生成新的配对码并重新配对。服务端会生成新的 `nodeId` 和 `nodeSecret`，不复用旧凭据。

### 轮换凭据加密主密钥

v1 不保留双密钥兼容层。先撤销活动节点，再更新
`OPENFX_NODE_CREDENTIAL_KEY`、重新部署控制面，最后重新配对。直接替换主密钥而不撤销/重配
会使现有加密凭据无法解密，Relay 和签名上报会按失败关闭。

### 节点或 OMLX 故障

- 节点离线时控制台继续展示已有 7 天趋势和追加式审计；实时操作返回 `node_offline`。
- OMLX 离线时只禁用 Agent 对话。恢复 `127.0.0.1:8000/v1` 后不需要重新配对。
- Keychain 项丢失时 Perry 不会从普通偏好恢复 secret；撤销云端节点后重新配对。
- SQLite journal 损坏或丢失时不要复制旧 Freemac NDJSON 到遥测库。先留档损坏文件，
  再重新启动节点并重新审批任何未完成动作。

## 验证

```bash
deno task check
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z \
  VITE_OPENFX_BUILD_HASH=local00 \
  deno task --config entry/web/deno.json build
perry check entry/desktop/src/main.ts --deep-deps
perry compile entry/desktop/src/main.ts -o dist/openfx-desktop
deno run --unstable-kv -A entry/desktop/tools/console-integration-smoke.ts
```

最后一条命令使用本机受信任的 `mkcert` 根证书创建只监听 loopback 的 TLS 控制面，编译并
运行真实 Perry 节点，再通过机器实际分配的公网 IPv6 访问固定 Relay。测试使用独立 Keychain
service，结束时删除凭据，不修改生产 HTTPS 或公网 IPv6 校验器。它当前预期在 Perry 原生
HTTPS 配对处失败；在该命令完整通过前，不能把 Freemac 从运行路径删除。

### Perry 客户端门禁证据

最小探针对同一个受本机 `mkcert` 信任的 loopback URL 设置 8 秒超时。curl、Deno 和 Node
均得到 `200`；Perry 编译产物的以下组合均超时，且服务端没有收到请求：

- `node:http.request` → `127.0.0.1` loopback；
- `node:https.request` → `localhost` / `127.0.0.1`，分别使用系统信任和显式根 CA；
- `node:https.request` → `example.com:443` 的公开可信端点；
- `node:tls.connect` → loopback，显式根 CA 且保持 `rejectUnauthorized: true`。

每次运行还会输出 `js_stdlib_init_dispatch` 为 no-op、stdlib dispatch 未链接到
runtime-only build 的警告。Perry API manifest 把 `https.request` 与 `tls.connect` 标为非
stub，但没有提供足以证明客户端请求可发送的完整 `ClientRequest`/socket 方法清单。静态
check/compile 通过不等价于客户端运行时可用。禁止用 `rejectUnauthorized: false`、shell
curl 或明文 HTTP 绕过该门禁。
