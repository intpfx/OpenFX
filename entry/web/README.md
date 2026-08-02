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

HLC 卡片打开同源的 `/hlc/` 只读展示应用。构建准备步骤只把地图所需的静态 HTML、CSS、
JavaScript、地理数据与抽象艺术资产复制到 Nitro 公共目录，不发布 legacy
认证模型、内容工作流 或 `divertor.js`。展示入口不会加载 `index.js` 或
`main.js`，因此不会连接 Deno KV，也不提供
账户会话、Cookie、登录、注册或数据提交。首页详情面板使用不允许表单和弹窗的 iframe
sandbox，进一步收紧展示边界。

部署版只复制 `community-map*.webp`，并把 HTML 中的 PNG fallback 改写为相同 WebP；源目录
可以继续保留 PNG 作为本地创作资产。所有 HLC 展示图合计不得超过 8 MiB，生成步骤会在超出
预算时直接失败，避免 Nitro 内联静态资源把 Deno Deploy 服务端入口再次撑大。

修改 `domains/hlc/source/index.html` 后，需要重新生成只读入口：

```bash
cd domains/hlc
deno run --no-config --allow-read --allow-write tools/build-display-app.ts
```

外部 GitHub 仓库也可以作为项目卡片展示，但需要在 `sourcePath` 中标注 public / private
边界，通过 `links` 提供仓库入口，并在详情面板中说明来源、内容范围和 OpenFX
只是索引入口还是承载运行入口。

`entry/web/tests/homepage-projects.test.ts` 会校验 JSON 卡片 ID 与详情面板 ID
完全一致，新增卡片后需要让 `deno task check` 继续通过。

### 首页 Source Field 预览

首页项目卡片可以通过可选的 `preview` 字段声明真实运行时预览：

```ts
type HomepageProjectPreview = {
  src: string;
  alt: string;
  position?: "center" | "top" | "bottom";
};
```

首版只为 `how-much-this`、`map-poster`、`gasmap` 和 `finlyzer` 四张卡片启用预览。 其中
Map Poster 直接复用 `/map-poster/tokyo-japanese-ink.webp`，其余资产位于
`public/homepage-previews/`。预览必须来自 1200×800
的真实本地页面截图；如果无法在不修改产品
状态的前提下生成示例数据，应使用真实默认空状态，禁止为截图增加 demo mode、HTTP API
或运行时 依赖。资产使用 `cwebp -q 78` 生成，每张不超过 180 KiB，四张合计不超过 700 KiB。

宽屏卡片默认显示 `sourcePath`，悬停或键盘聚焦时显示运行时预览；1100px 及以下改为静态顶部
横幅。窄屏或 `prefers-reduced-motion: reduce`
环境会关闭卡片入场、滚动透明衰减、预览擦入和 View
Transition，并保持所有卡片完整不透明。图片必须延迟加载、异步解码，加载前或失败后继续
展示 source 层，不显示破图占位。

### 首页设备定位海报背景

首页底部由单一 `HomepageFooterDock` 管理 `meta`、`index`、`action` 三个插槽。

- `meta`：承载临时状态、构建版本、主题控件，以及 `HomepageLocationPoster` 通过 render
  callback 注入的定位状态。
- `index`：承载项目计数、搜索、留言、返回或 Proxy 控件。
- `action`：承载当前场景的主操作。

桌面 Dock 使用两列和两条文字基线，`action` 位于第二列并跨越两行；900px
及以下仍是同一外壳，但固定在安全区上方并使用两行布局，交互控件高度不小于 44px。普通定位
状态不能自行固定定位或绘制独立外框。

首页在浏览器需要定位授权时仍显示独立的底部聚焦胶囊。胶囊之外的品牌、项目浏览器和统一
Dock 会暂时模糊并设置为
`inert`；允许、暂不使用、拒绝、超时或失败后立即恢复。授权胶囊桌面高度为
58px，主操作不小于 44px，且位置控制器继续独立维护焦点恢复、Escape、实时播报、海报请求与
object URL 生命周期。海报背景位于 Dock
外；详情面板隐藏定位控制时仍保留已生成背景和唯一的 OSM 归属链接。Map Poster
项目卡片仍是独立生成器入口。

定位必须来自 `navigator.geolocation`，不允许使用 IP、语言或时区推断。只有精度不超过 25
公里的设备结果才会发送到现有 `POST /api/map-poster/render`。首页固定使用
`japanese_ink`、6000 米范围和 1600×1000 SVG；服务端以坐标为地图中心，并用 Nominatim
反向解析城市标题。反向解析失败仍按真实坐标生成地图，但不显示未经确认的城市名。

海报可见时会显示可键盘访问的
[`© OpenStreetMap contributors`](https://www.openstreetmap.org/copyright)
浮动归属链接；首次授权的权限对话框期间，该链接会成为对话框内部的唯一归属链接，避免焦点离开
模态语义。它不显示海报标题、坐标或海报页脚。

OpenFX 不会把经纬度、城市名、SVG 或授权选择持久化到浏览器存储、URL、cookie 或数据库。
经纬度只在当前页面和请求中使用：会发送到 OpenFX 渲染接口、Nominatim 反向解析和 Overpass
地图数据请求；Nominatim 搜索只接收 Map Poster 的 `city` / `country` 文本。为遵守
Nominatim 频率要求，每个服务 isolate
对搜索和反向解析合计最多每秒发起一个请求。并发的相同
坐标反向解析会共享进行中的请求，但请求完成后立即丢弃坐标键和解析地点，不保留已完成的反向位置
缓存。Map Poster 的城市和国家文本搜索结果仍可保留按查询键控、30
分钟过期的内存缓存；该缓存不写入持久化存储，不同 isolate 之间也不共享。第三方服务的
日志与保留规则以其自身政策为准。未授权和失败状态继续使用现有中性网格背景，不得用东京或其他
预设城市冒充访问者位置。

`OPENFX_MAP_POSTER_NOMINATIM_SEARCH_URL` 与 `OPENFX_MAP_POSTER_NOMINATIM_REVERSE_URL`
可分别配置地点搜索和反向地理编码服务的 HTTPS
endpoint（例如自托管或已签约的容量服务，必须不含查询串、片段或嵌入式凭据）。本地/开发环境未
配置时才使用官方 Nominatim
endpoint；生产环境任一未配置时会跳过相应查询，绝不把请求悄悄发送 到公共
Nominatim。生产部署必须显式配置两者并确保服务容量与使用条款匹配。

`prefers-reduced-motion: reduce` 会关闭背景淡入、授权胶囊位移和等待脉冲。

### Editorial Index 与主题

- Dock 的插槽与断点布局遵循上一节约定；主题按钮位于 `meta` 插槽。
- 主题模式为 `auto`、`light`、`dark`；单一文字按钮按 AUTO → LIGHT → DARK → AUTO 循环。
- 仅手动模式写入 `localStorage["openfx-theme"]`；AUTO 删除该键并实时跟随系统。
- `theme-bootstrap.js` 必须在 React 入口前设置 `<html data-theme>` 和浏览器
  `theme-color`，避免暗色首屏闪白。
- 主题覆盖 OpenFX 首页与自有详情面板，不覆盖 Console 或第三方 iframe。
- 定位授权胶囊、inert/live-region 边界、唯一 OSM 归属和真实设备定位流程不得因主题或 Dock
  改造而改变。

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
- `OPENFX_MAP_POSTER_NOMINATIM_SEARCH_URL` — 生产环境必填的 HTTPS 地点搜索 endpoint
- `OPENFX_MAP_POSTER_NOMINATIM_REVERSE_URL` — 生产环境必填的 HTTPS 反向地理编码 endpoint

本地开发可以在启动命令前显式设置 `OPENFX_ADMIN_KEY`，获得跨重启稳定的登录 key；若还需
保留已配对节点，应同时固定 32 字节的 `OPENFX_NODE_CREDENTIAL_KEY`。这些开发值不得提交为
生产默认配置。

### 本地 HTTPS 配对

OpenFX Node 的 loopback HTTPS 配对使用唯一的规范入口；Web 必须已先构建完成，启动器不会
自动构建：

```bash
OPENFX_LOCAL_RUNTIME=/private/path/to/openfx-local-runtime \
  deno task web:local-pairing
```

该入口在 `https://127.0.0.1:34431` 提供 TLS，并在 `127.0.0.1:8000` 运行预构建的 Nitro
服务。loopback 开发默认使用管理 key `TEST`：启动器会刻意移除继承的
`OPENFX_ADMIN_KEY`、`DENO_DEPLOYMENT_ID` 以及生产值 `NODE_ENV`，让控制面走本地回退路径。
生产或非 loopback 请求仍必须显式设置 `OPENFX_ADMIN_KEY`，不能依赖 `TEST`。

`OPENFX_NODE_CREDENTIAL_KEY` 是独立的节点凭据加密密钥；可在启动前显式提供以保留本地 Deno
KV 数据，但绝不能复用管理 key `TEST`。运行目录会保存证书、Deno 缓存和权限为 `0600` 的
`pairing.json`，其中含有仅供本机配对使用的敏感信息。

## OpenFX Console 控制面

控制台不使用独立页面或独立页面路由。点击根页的 OpenFX Logo 会在首页后台面板中打开完整
控制台，统一维护一套管理界面和登录状态。

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

“Mac 配对”卡片会复制当前 HTTPS origin、显示 8 位短码与实时倒计时，并说明公网 IPv6 检测和
macOS Keychain 写入要求。HTTP 页面（包括本地预览）固定禁用配对码生成并提示 “请通过 HTTPS
控制台打开”，且不会把 HTTP origin 显示为 HTTPS 服务端地址。节点上线继续由现有
`heartbeat` SSE 和概览状态驱动；桌面端每分钟上报一次，控制面使用 2 分钟在线窗口容忍
一次调度延迟，避免在两次正常心跳之间误判离线。卡片会
自动切换为“节点已连接”，无需手动刷新，也不会把管理员或节点凭据写入浏览器存储。

Relay 不接受目标 URL。服务端只连接当前配对节点上报的全局 IPv6，端口固定为
`24531`，并使用共享 OpenFX Node v1 协议签名、加密请求和解密响应。节点回包在加密载荷中
绑定请求 nonce、HTTP 方法和固定路径；请求禁止跟随重定向，任何 3xx 都按 Relay 不可达
处理。服务端默认流式读取最多 64 KiB，固定 `/v1/processes` 操作允许 256 KiB，Agent
消息读写允许 512 KiB，认证并校验关联后才返回结果。每次 Relay 会在实际网络
请求前持久化意图审计，结果审计则尽力追加。 Agent 消息 Relay 使用 35
秒超时，对应节点端整个 turn 共享的 30 秒绝对截止时间；其他 Relay 操作仍为 8 秒。

配对 201 在传输中丢失时，同一请求指纹可在 grace 期内幂等恢复相同节点 secret；不同请求、
已替换的 active 节点和 grace 期外请求均不能恢复。管理员浏览器 API 不返回节点凭据。
此后的心跳、遥测和事件上报使用
`x-openfx-node-version`、`x-openfx-node-timestamp`、`x-openfx-node-nonce`、
`x-openfx-node-content-sha256` 和 `x-openfx-node-signature`，不会传 Bearer
secret。服务端 在同一个 Deno KV 原子事务中消费 nonce
并提交权威写入。审计接口默认按最新优先返回 100 条，可用 `limit`（最大 500）和独占的
`before` 游标向前翻页。

该控制面已经与补丁版 Perry 0.5.1220 节点完成真实 HTTPS、IPv6 Relay、SSE 和审批闭环
验证，并取代旧 Freemac 运行路径。详见
[`../../docs/openfx-console-architecture.md`](../../docs/openfx-console-architecture.md)。

Deno Deploy 构建使用项目自有的流式入口：请求体在进入 Nitro 应用前硬限制为 64 KiB，
超限立即返回 `413`；入口同时以运行时提供的真实远端地址覆盖外部伪造的转发地址。构建
流程会检查最终 bundle，阻止 Nitro 预设中不受限的 `request.arrayBuffer()` 路径回归。
