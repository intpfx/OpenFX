# 旧项目分析常见遗漏模式

从 core/hiverepo/pmp/toys/dss/esn 六轮迁移中总结的常见遗漏点。

## 1. 浏览器端能力容易被忽略

OPFS、IndexedDB、Web Component 等浏览器端代码常被认为"不能放 shared"就不提。判断标准应该是**算法价值**而非运行时环境：

| 浏览器模块 | 提取位置 | 价值 |
|-----------|---------|------|
| opfs-engine.ts | `_shared/` | OPFS 文件 CRUD + 元数据追踪，跨框架通用 |
| idb-engine.ts | `_shared/` | IndexedDB 原子操作抽象，跨框架通用 |
| island-notice.ts | `_shared/` | 苹果灵动岛通知 Web Component |
| opfs-finder.ts | `_shared/` | OPFS 文件浏览器 UI Web Component |
| ffmpeg-pipeline.ts | `_shared/` | ffmpeg.wasm 通用转换管线，浏览器端 |

**模式**：提取后标记"浏览器端"（在 deno.json lint exclude 注册），不因运行环境不同就放弃提取。

## 2. 通信协议容易被看成"业务代码"

WebSocket 连接管理、序列化方案、跨进程通信——这些常被贴上"这个项目特有的"标签跳过：

- **ws-client.ts**：心跳/重连/就绪状态，任何 WebSocket 应用都需要
- **ws-rpc.ts**：原生 WebSocket 的请求/响应模式，通用基础设施
- **typed-codec.ts**：Map/Set/BigInt/ArrayBuffer 序列化，解决 JSON 的天花板
- **broadcast-relay.ts**：BroadcastChannel 跨 region 路由，Deno Deploy 架构模式

## 3. 部署/基础设施代码容易被忽略

流式推送、节点注册、跨区域通信——这些"部署细节"通常最有抽象价值：

- **streamKvEntries**（kv.ts）：DenoKV 的 watch + SSE 推送模式
- **node-registry.ts**：DenoKV 节点在线/心跳/离线生命周期

## 4. 纯纪念项目不要改造

wanone 模式：第一个网站不做任何现代化改造（不移 JS、不改路径、不更新框架），保持最初的模样。IIS 配置文件、16MB 背景视频、iframe 伪 SPA 骨架都是纪念价值的一部分。

## 用户偏好纲要

- 一次列全所有模式再动手（不逐个追问"这个要不要那个要不要"）
- 宁可多列不要自己筛选——让用户判断价值
- 先检查 README 和 GitHub 描述是否与仓库定位一致，不一致先修描述再分析
- 解耦 > 大合并（提取到 _shared 而不是合并成大 domain）
- 保留+互补 > 替换（新代码补充旧能力，不急着统一替换）
- 验证先行（提取完就跑测试，不攒到一批再验证）
- 纯函数优先（class → 导出顶层函数，去掉隐式状态）
