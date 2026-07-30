# OpenFX 控制台架构与运维

OpenFX 控制台的目标架构由三个边界清晰的部分组成：Nitro/Deno Deploy 控制面、Perry 原生
Mac 节点，以及运行时无关的 `domains/e` Agent/审批内核。Web 控制面、共享协议和 Perry
节点已经完成切换。旧 Freemac Bun/Elysia Core 与独立 Dashboard 已在真实组合 smoke
通过后删除，不保留双运行时兼容层。

## 运行边界

- `entry/web` 在根页 OpenFX Logo 打开的后台面板中提供控制台、管理员会话、配对、Deno KV
  历史、SSE 和固定 Relay，不提供独立控制台页面路由。
- `entry/desktop` 是目标 Mac 节点。Perry 0.5.1220 稳定策略暂时固定为 accessory 菜单栏
  后台模式；已保存的 `launchMode` 保留作未来兼容，当前切换控件不可操作。原生 `●` Tray 可
  显示同一文件管理窗口；节点始终监听 `[::]:24531`，关闭窗口不停止服务。连接、服务、
  网络、Relay、Agent 和上报时间只显示在菜单栏。
- Perry 0.5.1220 的生产桌面完全不创建 `Canvas`，继续规避已确认的原生 IOAccelerator
  风险。主窗口使用原生 `ScrollView`、`ZStack` 和 `ImageFile` 呈现全类型文件封面墙；
  节点状态变化不会重建文件墙。CPU、内存等遥测在服务启动时采集一次，之后由窗口激活、
  手动刷新或配对检查触发。持久化的 `reduceMotion`
  控制文件详情层和媒体查看层的短时透明度过渡，
  不会启用连续帧核心。只有原生内存门禁通过后才能重新启用动态核心；Canvas 渲染器只作为
  未来能力保留。
- 主窗口使用 Perry `titlebarStyle: "overlay"`：AppKit 保留原生交通灯和标准窗口行为，
  同时把内容扩展到透明标题区，不再显示独立标题栏。
- 文件管理器不浏览用户目录。原生文件选择器选中的项目先复制到
  `~/Library/Application Support/OpenFX Node/Files`，之后文件墙、默认应用打开和 Finder
  定位都只面向该应用自管副本。同名导入使用序号避让，复制先进入隐藏临时项再原子改名；
  原文件移动或删除不会影响已导入内容。
- 自管库收录所有文件类型和 macOS 应用包。图像直接显示，其他可预览类型使用并发上限为 2 的
  Quick Look 缩略图；无法预览时显示类型封面。缩略图缓存到
  `~/Library/Caches/OpenFX Node/Thumbnails`，管理副本和缩略图都不上传。当前版本不提供
  重命名、移动或删除。封面不常驻文件名；1–6 个文件使用 200×150 紧凑矩形、每行最多 3
  个，卡片横纵无间隙，未使用区域透出 `NSVisualEffectView` 的 `underWindowBackground`
  磨砂材质； 根容器、滚动文档和稀疏行不覆盖不透明底色。7–24 个文件自适应铺满窗口，24
  个文件为 4 行 × 6 列，超过 24
  个后保持四行可视节奏并纵向滚动。文件管理窗口右上角只保留导入、
  刷新和打开自管文件库三个无背景纯图标操作；Perry 的无边框按钮关闭原生 focus ring，
  因此聚焦时也不会出现底色。单击图像或视频在当前窗口覆盖文件墙进入沉浸查看：图像通过
  `NSImageScaleProportionallyUpOrDown` 完整适配可视区域，视频由原生 `AVPlayerView`
  提供悬浮播放控件；返回按钮恢复文件墙，非媒体文件继续使用居中详情层。配对和界面偏好
  由菜单栏打开独立设置窗口。
- 最终二分确认增长路径是 5 秒系统轮询：最小 Perry UI、完整静态 UI、空定时器、空输出
  `execFile` 以及丢弃输出的 `top` 均稳定；仅启动 `systemMonitor`
  就会因反复文本解析与对象图 构造产生约 8 MiB/分钟的 IOAccelerator
  驻留增长。生产节点改为启动一次加用户事件驱动的 完整快照，3 分钟完整服务验证中驻留保持
  13.8 MiB、区域保持 5 个。Perry HTTP/ext-net pump 的无分配空闲快路径作为独立防线保留。
- 单次本地采样复用 `top` 第二帧。IPv6 候选来自事件触发的 `ifconfig` 完整接口地址，确保
  macOS 隐私临时地址也能与外部 HTTPS 观察结果匹配。进程诊断仍按 CPU 排序，最多保留 100
  条，摘要提供真实总数。按 PID 单次运行的 `ps` 只用于已审批进程终止前的身份复核；
  这些输出收敛是防御性约束，不是本次内存根因。
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

### 本机 HTTPS 配对运行边界

OpenFX Node 的本机配对使用预构建 Web 输出的唯一入口：

```bash
OPENFX_LOCAL_RUNTIME=/private/path/to/openfx-local-runtime \
  deno task web:local-pairing
```

启动器不会构建 `.output`；必须先完成 Web 构建。它从当前 checkout 派生 Web 根目录，在
`127.0.0.1:8000` 启动 Nitro，并以本机受信任的 `mkcert` 根证书在
`https://127.0.0.1:34431` 提供 loopback TLS 代理。`OPENFX_LOCAL_RUNTIME` 是权限为 `0700`
的私有目录，保存 TLS 证书、Deno 缓存与权限为 `0600` 的 `pairing.json`。Nitro 以稳定的
Deno location `https://127.0.0.1:34431` 运行，因此重复启动复用同一 Deno KV 身份；不要用
不同 location 取代它，否则会创建独立本地存储。

Perry HTTPS 不读取 macOS 钥匙串中的 mkcert 信任。桌面客户端因此只为精确 loopback 主机从
`CAROOT` 或 macOS 默认 mkcert 目录加载 `rootCA.pem`；显式 `NODE_EXTRA_CA_CERTS`
仍优先，公网与生产主机不会继承这条本机开发信任。

该本机入口特意从子进程环境剥离 `OPENFX_ADMIN_KEY`、`DENO_DEPLOYMENT_ID` 和生产
`NODE_ENV`，所以 loopback 开发通过现有控制面回退使用 `TEST`。`TEST` 只用于本机管理员
登录与受保护的配对信息，不能作为 `OPENFX_NODE_CREDENTIAL_KEY`；后者独立加密节点凭据。
生产和任何非 loopback 部署仍必须明确配置 `OPENFX_ADMIN_KEY`，且没有默认管理密钥。

## 会话、配对与密钥

1. 管理员通过 `POST /api/admin/session` 登录，获得 12 小时绝对有效的 `HttpOnly`、
   `SameSite=Strict` cookie；生产 cookie 同时带 `Secure`。
2. 控制台生成 8 位 Crockford Base32 配对码。配对码逻辑有效期为 10 分钟，并通过 Deno KV
   原子事务保证只能消费一次；10 分钟 live marker 与消费事务一起校验，11 分钟 grace
   record 的最后 1 分钟只用于有界恢复和 `node_pairing_expired` 错误语义。消费事务只写入
   `incomplete` 配对记录，以及配对码命名空间下的 pending 节点、加密凭据和状态；这些记录
   全部带不超过 grace 截止点的物理 TTL，且不会覆盖当前 active 节点。请求指纹由规范化内容
   计算；同一请求重试会解密并复用同一 pending secret，不同请求不会取得该 secret。
   最终化在调用事务前再次检查逻辑截止时间，并在同一事务中校验 live marker、pending 与
   active 各版本，然后把 pending 提升到 active、标记 `completed` 并删除全部 pending
   key。存储失败时旧 active 保持原样，pending 无调用方重试也会自动过期。Deno KV
   不能把服务端墙钟比较放进原子事务，因此截止时间线性化在最终化尝试前的时间检查和
   live-marker CAS；不存在可保证的“提交返回瞬间”墙钟判断，也不再做提交后补偿。

   若最终 201 在传输中丢失，grace 期内同一规范化请求可从 `completed` 记录和当前 active
   加密凭据幂等恢复相同 `nodeId` 与 `nodeSecret`；它不创建或替换状态。请求指纹不同、
   active 已变化或 grace 已结束时不会返回 secret。管理员浏览器接口始终不读取节点凭据。
3. Perry 节点通过 HTTPS 提交配对码和经本机、外部观察共同确认的公网 IPv6。服务端只在
   初次配对或上述同请求传输重试中返回 32 字节 `nodeSecret`。
4. 节点把 secret 写入 macOS Keychain 的 `OpenFX Node` service；普通偏好只保存
   `nodeId`、节点名、服务端 URL、Relay 开关、配对时间、下次启动模式 `launchMode`，以及
   控制文件管理器短时过渡的 `reduceMotion` 偏好。它不会启用连续帧核心。Relay、界面设置
   和配对提交统一通过同步原子补丁合并最新值；即使用户在 HTTPS 或 Keychain
   等待期间切换设置，配对提交也只覆盖节点字段，不重置 Relay，绝不把 secret
   写入偏好。每个异步配对或恢复边界结束后，State、Relay reporter 和 Event reporter
   从同步权威偏好一次性重建；若 Keychain 查询前后的 `nodeId` 不一致，则拒绝旧
   secret，且不会清除查询期间已完成的新配对。持久化失败会先恢复提交前的原始序列化快照，
   调用方只在成功后更新进程内状态；恢复失败则返回独立错误，避免把磁盘状态误报为已保存。
5. 服务端只保存校验摘要和由 `OPENFX_NODE_CREDENTIAL_KEY` 加密的凭据副本。浏览器 API
   不返回 secret、摘要、密文或解密结果。

### Web 配对引导

管理员从根页 OpenFX Logo 进入后台面板，并在“远程接入”或“设置”打开 Mac 配对卡片后，
控制台只把当前页面的 HTTPS origin 作为 Perry 服务端地址，不复制路径、查询参数或片段。
卡片提供地址复制、8 位短码复制和实时倒计时，并按“检测公网 IPv6 → 输入 HTTPS 地址与短码 →
写入 macOS Keychain”说明桌面端的三个步骤。复制被浏览器拒绝时会保留可选择文本，并给出
中文失败提示。

HTTP 页面（包括 localhost 和 `127.0.0.1` 预览）不会生成配对码，固定显示“请通过 HTTPS
控制台打开”，也不会把 HTTP origin 放进“HTTPS 服务端地址”字段。这是产品门禁，不使用
浏览器对 loopback secure-context 的例外，也不改变配对 API 的服务器端认证或原子单次消费
语义。

配对完成后，Perry 原有的 `heartbeat` SSE 和控制台概览刷新会更新同一 `NodeAvailability`
状态。配对卡片据此自动切换为“节点已连接”，不增加轮询协议、手动刷新
按钮或浏览器凭据存储。

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
校验关联信息，再只向浏览器返回结果。Relay 请求使用手动重定向模式，任何 3xx 都按不可达
处理，不会跟随 `Location` 离开固定节点。Relay HTTP 响应默认按流读取并硬限制为 64 KiB；
固定的 `/v1/processes` 操作允许 256 KiB，Agent 消息读写允许 512 KiB。任一路由超限都会
立即取消读取，不进入 JSON 或密码学验证。控制面在发出网络请求前先持久化 `relay.intent`
审计；结果审计为尽力追加，因此外部效果成功后即使审计存储短暂失败，已有意图证据仍保留。

只读工具可以直接执行：系统概览、进程列表、网络状态、Relay 状态和审计查询。终止进程、
打开允许列表内的应用和修改 Relay 开关必须审批。审批保存工具参数指纹和 5 分钟过期时间；
批准、拒绝、过期和已消费状态都不可重复应用。v1 没有任意 Shell、任意文件读写或任意 URL
请求工具。

OMLX 工具调用最多进行 3 轮、12 次。每轮工具结果经字节上限裁剪后，以标准 assistant
`tool_calls` 和 tool 消息回送本地模型，最终回答才进入会话历史。历史同时受 30 条消息和
240 KiB 编码体积约束；模型单次回答限制为 128 KiB UTF-8，避免合法历史永久超过 Relay
信封预算。一个 Agent turn 的所有 OMLX 轮次共享 30 秒绝对截止时间，云端 Relay 使用 35
秒超时留出传输余量；Relay 客户端断开会逐层取消 dispatcher 和 OMLX 请求，取消后的 turn
不写历史，也不继续创建工具调用或审批。

## 数据与事件

- Perry 在服务启动时采样一次本机状态，之后由窗口激活、手动刷新或配对检查触发；公网 IPv6
  外部观察缓存 1 分钟，但每次仍以最新本机候选地址重新匹配，并发观察共享同一个
  in-flight。
- 已配对节点在事件驱动采样后尝试顺序 heartbeat + telemetry；成功与失败都节流 1 分钟。
  云端继续按分钟聚合收到的遥测并保留最近 7 天。
- SSE 事件包含 `heartbeat`、`telemetry`、`agent.delta`、 `approval.requested` 和
  `approval.resolved`，支持 `Last-Event-ID` 续接。
- 节点事件批次具有请求级幂等性；失败不会留下半批事件，安全重试也不会重复追加。
- 控制面审计是追加式数据，不使用遥测 TTL。审计接口按最新优先分页返回。
- Perry 本地审批、执行和审计写入 SQLite journal，目录权限 `0700`，数据库/WAL 权限
  `0600`。

已删除的 Freemac Core 的旧审计位置是
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
deno task perry:runtime --source /path/to/Perry-v0.5.1220
PERRY_LIB_DIR=/path/to/release perry check entry/desktop/src/main.ts --deep-deps
deno task desktop:app
deno task desktop:app-smoke
deno task desktop:memory-smoke
deno run --unstable-kv -A entry/desktop/tools/console-integration-smoke.ts
```

`desktop:memory-smoke` 只针对通过 provenance 校验的固定 Perry 0.5.1220 运行库和已构建的
`dist/OpenFX Node.app`。它先通过 token、marker PID、可执行文件真实路径、`ps` 和 `lsof`
绑定应用包实例，预热 30 秒后建立基线，再每 30 秒采样一次 `vmmap -summary`，采样窗口持续
10 分钟。相对基线，门禁要求 IOAccelerator region 数量增量 `<= 0`、IOAccelerator
虚拟内存增量 `<= 64 MiB`、resident 增量 `<= 16 MiB`、物理 footprint 增量 `<= 96 MiB`。
字段缺失时 fail closed； 结束时输出基线、峰值、最终及失败快照；清理先向已核验 bundle
发送原生 Quit Apple Event， 失败后才终止已经核验的 PID。

最后一条命令使用本机受信任的 `mkcert` 根证书创建只监听 loopback 的 TLS 控制面，编译并
运行真实 Perry 节点，再通过机器实际分配的公网 IPv6 访问固定 Relay。测试使用独立 Keychain
service，结束时删除凭据，不修改生产 HTTPS 或公网 IPv6 校验器。该组合门已经覆盖并通过
HTTPS 配对、签名心跳与遥测、OMLX 离线降级、SSE 续接，以及审批执行、拒绝、过期和重放。

### Perry 0.5.1220 原生运行时补丁

补丁文件是
[`../entry/desktop/perry/perry-v0.5.1220-openfx.patch`](../entry/desktop/perry/perry-v0.5.1220-openfx.patch)，
构建入口是 `deno task perry:runtime`。它只接受处于精确提交
`06137858dc8c6f80975238377138f2f948d6ef88` 且没有已跟踪或未跟踪改动的源码，再用 Rust
1.96.1 构建。补丁或编译产物不能复用为下一次构建输入；必须重新取一个干净 clone。

补丁处理以下原生边界：

- 外部 HTTP 静态库启用完整 runtime 并排除会遮蔽真实 stdlib 的 no-op stubs；
- `node:http` server 对 `::` 和其他 IPv6 listen host 使用带方括号的 socket 地址；
- 外部 `ClientRequest` 注册自己的方法/属性分派扩展，避免共享小整数 handle ID 在 SQLite
  等其他注册表中碰撞后吞掉 `end()`；
- Set 在任何 GC header 解引用前先用 `addr_class::is_handle_band` 排除完整
  `[0, 0x100000)` handle 段，并只通过 `try_read_gc_header` 识别真实 GC 字符串；
- 客户端 terminal 回调完成后把 `ClientRequest` 与对应 `IncomingMessage` 延迟到下一次
  HTTP pump 统一移除，同时清理 surface 状态并通过 perry-ffi quarantine 延迟数字 ID
  复用，既避免长期耗尽 `[1, 0x40000)`，也避免回调同轮发生 ABA；
- HTTP server pump 把“监听存活”和“待处理工作”分开；安静时跳过 typed handle 快照，活动时
  通过可重入复用缓冲区保存 HTTP/HTTPS/HTTP2 handle ID，避免 8 ms tick 持续分配临时
  `Vec`； 挂起响应的 reaper 在门控前独立运行；ext-net 生产者设置原子 pending hint，空闲
  tick 在 队列加锁和 scratch buffer 分配前返回；
- AppKit 事件循环始终驱动 Perry async reactor、stdlib、HTTP/HTTPS 与微任务
  pump，隐藏窗口不会停止 health、Agent 或 Relay；系统快照由启动与用户事件触发。原生
  visibility 回调只暂停隐藏窗口的 Canvas frame， `menuBarOnly`
  冷启动在窗口真正显示前不会绘制或排帧；
- Tray 相对资源先从 `.app/Contents/Resources` 解析，再回退到可执行文件目录，确保应用包与
  开发二进制使用同一资源名。

成功构建会在 `PERRY_LIB_DIR` 写入 `openfx-perry-runtime-provenance.json`，记录 Perry
版本与 提交、Rust toolchain、固定补丁 SHA-256，以及 Perry CLI 和四个必需静态库各自的
SHA-256。 `desktop:app`、`desktop:app-smoke` 和组合 smoke 都会重新计算产物哈希并 fail
closed：manifest 缺失、pin 字段变化或任一产物被改写时都不会继续编译或启动应用。

运行 smoke 时必须设置脚本输出的 `PERRY_LIB_DIR`，并保持
`--no-auto-optimize`，确保链接的是已验证库。验证仍保持证书校验，不使用
`rejectUnauthorized: false`、Shell curl 或明文公网 HTTP 绕过门禁。
