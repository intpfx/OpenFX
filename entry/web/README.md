# OpenFX Web

这是 OpenFX 的 VitePlus + React + Nitro Web 端。

Web 端依赖统一由 Deno 和仓库根目录的 `deno.lock` 管理，不再依赖 `pnpm`。

## 常用命令

```bash
deno task --config entry/web/deno.json dev
deno task --config entry/web/deno.json build
deno task --config entry/web/deno.json preview
```

## 本地端口

- 前端 Vite：`http://localhost:5501`
- Nitro 服务：`http://localhost:3000`

## 首页项目卡片约束

`entry/web/content/homepage-projects.json` 里的每一张项目卡片都必须能点击打开对应内容。

新增或改名项目卡片时，需要同步更新：

- `entry/web/homepage-panels.ts` 的 `PROJECT_DETAIL_PANEL_IDS`
- `getProjectCardClick()` 的可点击项目映射
- `Homepage` 内对应的 `activePanel === "<project-id>"` 渲染分支

不要只在 JSON
里新增卡片。没有详情内容的卡片会让首页项目浏览器出现断点，后续维护时应优先补齐说明面板、嵌入页面或外部安装/访问入口。

外部 GitHub 仓库也可以作为项目卡片展示，但需要在 `sourcePath` 中标注 public / private
边界，通过 `links` 提供仓库入口，并在详情面板中说明来源、内容范围和 OpenFX
只是索引入口还是承载运行入口。

`entry/web/tests/homepage-projects.test.ts` 会校验 JSON 卡片 ID 与详情面板 ID
完全一致，新增卡片后需要让 `deno task check` 继续通过。

## 部署目标

默认部署目标是 Deno Deploy，由 Nitro 输出服务端入口并由 VitePlus 构建 SPA 客户端。

## 构建版本信息

Web 页底部会展示构建版本。`deno task build` 会自动补齐：

- `VITE_OPENFX_BUILD_TIME`：UTC 构建时间，格式为 `YYYY-MM-DDTHH:mm:ssZ`
- `VITE_OPENFX_BUILD_HASH`：当前提交的 7 位短哈希

如果 CI 或手动命令已经提供这两个变量，构建脚本会保留显式值；否则会用当前 UTC 时间和
`git rev-parse --short=7 HEAD` 生成。没有 Git 元数据时，会退回到 Deno Deploy build id
的短前缀；这些来源都不可用时才显示 `unknown`。

## 已托管在 `apps/web` 中的服务端能力

- DownIP 更新接口：`POST /update`
- DownIP 映射查询接口：`GET /update`
- DownIP 重定向接口：`GET /:key/*`
- 可选代理接口：`GET|POST|PUT|PATCH|DELETE /api/proxy/*`
- Map Poster 生成接口：`POST /api/map-poster/render`
  - 基于 `originalankur/maptoposter` 改造，Web 卡片会展示来源、OpenFX 改动和差异
  - Web 入口使用地图点选中心点，请求体优先传 `latitude` / `longitude`
  - `city` / `country` 只作为海报标题文案；未传坐标时才回退到地点解析

### 环境变量

- `DOWNIP_REDIRECT_SCHEME` — 重定向协议，默认 `http`
- `DOWNIP_REDIRECT_PORT` — 可选的全局重定向端口覆盖值
- `OPENFX_PROXY_UPSTREAM` — 设置后启用可选代理路由
- `OPENFX_ADMIN_KEY` — 管理控制台登录密钥；Deno Deploy 生产环境必须显式配置
- `OPENFX_NODE_CREDENTIAL_KEY` — 32 字节文本或 32 字节 Base64URL 密钥，用于 AES-256-GCM
  加密保存配对节点凭据

## OpenFX Console 控制面

管理 API 使用 12 小时绝对有效期的 `HttpOnly`、`SameSite=Strict` cookie，会话 token 仅以
SHA-256 摘要保存。除 localhost 外 cookie 同时带 `Secure`；旧的 `x-openfx-admin-key`
header 不再授权 `/api/admin/*` 或 `/api/console/*`。

- `POST|GET|DELETE /api/admin/session` — 登录、恢复和退出会话
- `POST /api/console/pairings` — 创建 10 分钟、原子单次使用的配对码
- `DELETE /api/console/node` — 撤销当前节点及其加密凭据，保留审计记录
- `POST /api/node/pair` — 配对唯一活动节点并一次性返回节点 secret
- `POST /api/node/heartbeat`、`POST /api/node/telemetry` — 上报节点状态和遥测
- `POST /api/node/events` — 使用节点身份上报 Agent 增量、审批请求与审批结果事件
- `GET /api/console/overview`、`GET /api/console/processes` — 固定 Relay 查询
- `GET|POST /api/console/agent/messages`、`GET|POST /api/console/approvals` — Agent
  消息和审批固定操作
- `GET|POST /api/console/relay` — Relay 状态与设置
- `GET /api/console/telemetry`、`GET /api/console/audit` — 7 日分钟遥测和审计
- `GET /api/console/events` — 支持 `Last-Event-ID` 的 SSE 事件流

Relay 不接受目标 URL。服务端只连接当前配对节点上报的全局 IPv6，端口固定为
`24531`，并使用共享 OpenFX Node v1 协议签名、加密请求和解密响应。节点回包在加密载荷中
绑定请求 nonce、HTTP 方法和固定路径；服务端默认流式读取最多 64 KiB，只有固定
`/v1/processes` 操作允许 256 KiB，认证并校验关联后才返回结果。每次 Relay 会在实际网络
请求前持久化意图审计，结果审计则尽力追加。

配对 201 在传输中丢失时，同一请求指纹可在 grace 期内幂等恢复相同节点 secret；不同请求、
已替换的 active 节点和 grace 期外请求均不能恢复。管理员浏览器 API 不返回节点凭据。
此后的心跳、遥测和事件上报使用
`x-openfx-node-version`、`x-openfx-node-timestamp`、`x-openfx-node-nonce`、
`x-openfx-node-content-sha256` 和 `x-openfx-node-signature`，不会传 Bearer
secret。服务端 在同一个 Deno KV 原子事务中消费 nonce
并提交权威写入。审计接口默认按最新优先返回 100 条，可用 `limit`（最大 500）和独占的
`before` 游标向前翻页。

Perry 0.5.1220 的真实原生 HTTPS 客户端门尚未通过，所以控制面暂不取代 `domains/freemac`
的生产运行路径。详见
[`../../docs/openfx-console-architecture.md`](../../docs/openfx-console-architecture.md)。

Deno Deploy 构建使用项目自有的流式入口：请求体在进入 Nitro 应用前硬限制为 64 KiB，
超限立即返回 `413`；入口同时以运行时提供的真实远端地址覆盖外部伪造的转发地址。构建
流程会检查最终 bundle，阻止 Nitro 预设中不受限的 `request.arrayBuffer()` 路径回归。
