# ESN（Edge Storage Node）模式提取记录

## 来源

- 项目：`github.com/intpfx/esn`（2024-08，PRIVATE）
- 描述：Edge Storage Node — 去中心化文件存储 + WebSocket P2P 中继
- 前端入口：`main.js`（浏览器端，32KB）
- 服务端入口：`index.js`（Deno server，21KB）
- 远程与本地已于 2026-06-04 应要求删除

## 提取的模块一览

| 模块 | 对应原始代码 | 通用性 |
|------|-------------|--------|
| `_shared/typed-codec.ts` | `encoder()` / `deliver()`（index.js） | 任何需要序列化 JS 类型的场景 |
| `_shared/ws-rpc.ts` | `socket.reply()` + `socket.solver`（index.js `initSocket`） | 任何 WebSocket 请求/响应通信 |
| `_shared/broadcast-relay.ts` | `BroadcastChannel` + Solver（index.js 全局 bus） | Deno Deploy 多 region 消息路由 |
| `_shared/node-registry.ts` | `type:"online"` / `type:"heartbeat"` 处理（index.js `initSocket.onmessage`） | 任何 DenoKV 节点管理场景 |
| `_shared/opfs-engine.ts` | `DataEngine`（main.js） | 浏览器端 OPFS 文件存储（entry/web） |

## 原始架构概述

```
浏览器端（main.js）                    Deno 服务端（index.js）
┌──────────────────┐             ┌─────────────────────────┐
│  DataEngine       │  WebSocket  │  initSocket()            │
│  (OPFS 文件存储)   │◄───────────►│  - socket.reply()        │
│  TransEngine      │             │  - solver Map            │
│  - 心跳重连       │             │  - 节点注册 (DenoKV)     │
│  - 请求队列       │             │  - 跨 region 中继        │
│  - 多 region 连接 │             │    (BroadcastChannel)    │
│  编码/解码        │             │  编码/解码               │
└──────────────────┘             └─────────────────────────┘
```

## 核心模式说明

### 1. 类型编码（typed-codec）

JSON 只能表达 string/number/boolean/null/object/array，无法直接传输 Map、Set、BigInt、Blob、TypedArray 等 JS 类型。

**方案**：将 `{ name: "foo", data: blob }` 编码为 `{ "String[name]": "foo", "Blob[data]": [1,2,3,...] }`，key 中嵌入类型前缀。解码时按前缀还原。

支持类型：String/Number/Boolean/Null/Undefined/ArrayBuffer/BigInt/Deno.KvU64/BigInt64Array/BigUint64Array/Blob/Map/Set/Array/Object/全部 TypedArray。

**修复**：原始 `deliver` 函数中有 bug（`this.$deliver` 引用但函数是 standalone 非方法），TS 版本已修。

### 2. WebSocket RPC（ws-rpc）

给原生 WebSocket（fire-and-forget）增加 `.reply()` 方法，实现请求/响应语义：

```
socket.reply({ type: "query", fileName: "test.txt" })
  →  等待匹配的 randomStamp 响应
  →  返回 Promise<response>
```

核心组件：
- `socket.solver: Map<randomStamp, resolve>` — 匹配请求和响应
- `socket.queue: Promise[]` — FIFO 响应队列
- `socket.reply()` — 发送消息 + 等待匹配回复

### 3. BroadcastChannel 跨区域中继（broadcast-relay）

Deno Deploy 的 BroadcastChannel 在同一 region 的实例间通信，不同 region 隔离。这个模块在每个 region 的实例上运行同一个 BroadcastChannel 名称，消息携带 `targetRegion`，只有目标 region 处理。

```
region-us-west2  ──bus.postMessage({targetRegion:"europe-west2", ...})──►  region-europe-west2
```

结合 WebSocket：客户端连接到任意 region，服务端通过 BroadcastChannel 把 WebSocket 升级请求转发到目标 region 的实例。

### 4. 节点注册表（node-registry）

DenoKV key 结构：`["node", uuid]` → `NodeInfo`

| 字段 | 说明 |
|------|------|
| serverRegions | 节点连接的 region 列表 |
| status | "online" / "offline" |
| loginTime | 本次上线时间戳 |
| onlineTime | 累计在线时长 |
| quota / usage | 存储配额和已用空间 |

操作：online（新建或更新）→ heartbeat（更新用量）→ offline（标记离线+累计时长）→ list/get。

### 5. OPFS 文件存储引擎（opfs-engine）

基于浏览器 Origin Private File System 的文件存储引擎，数据仅对当前 origin 可见。

能力：
- 文件 CRUD（`set()` / `get()` / `delete()` / `clear()`）
- 元数据追踪（自定义 `.info` 文件记录 name/size/type/lastModified/owner/price/private）
- 文件过滤搜索（按前缀/后缀/包含）
- 存储容量查询（`navigator.storage.estimate()`）
- 数据持久化（`navigator.storage.persist()`）

浏览器兼容：Chrome 86+ / Edge 86+ / Firefox 111+（需要 secure context）。

## 排除的部分

以下 esn 功能**未提取**，因为与 Deno Deploy 多 region 架构强绑定或为纯 UI：

- **WebSocket 升级请求跨 region 转发** — `Deno.upgradeWebSocket(request)` 在 BroadcastChannel 上传输的实现，严重依赖 Deno Deploy 运行时
- **前端 UI** — `main.js` 中的 UI 渲染（导航栏切换、文件块展示、多视图切换）和 `index.html` / `style.css`。纯界面层，无通用模式
- **图标生成** — `icon()` 函数（SVG → PNG/ICO 转换），依赖 `deno.land/x/imagescript` 和 `deno.land/x/canvas`
