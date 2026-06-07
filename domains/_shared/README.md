# _shared

`_shared` 放置多个 domain 共用、但不属于具体产品业务的基础设施代码。

提取自 `core/` 项目（SGR 框架原型）的代码放在这里做跨域共享工具，不做 domain。

## 目录结构

```text
kv.ts              # ScopedKv、getKv、getDomainKv（Deno KV 封装）
binary-chunk.ts    # 二进制分片分离器 — 用0xFF×4分隔符拆解混合数据流
bytes-codec.ts     # 类型安全序列化协议 — Map/Set/BigInt/ArrayBuffer等递归编解码
crypto-dice.ts     # π数列加密工具 — 纯算法，零依赖
qrcode.ts          # QR 码编码器（版本 1-40，所有纠错级和编码模式）— 纯算法，零依赖
swt.ts             # String Web Token 认证 — AES-GCM + HMAC-SHA256 签发/验证
opfs-finder.ts     # OPFS 文件浏览器 Web Component（浏览器端）
opfs-engine.ts     # OPFS 存储引擎（浏览器端）
idb-engine.ts      # IndexedDB 通用原子操作层 — CRUD 抽象（浏览器端）
island-notice.ts   # 苹果灵动岛风格通知 Web Component（浏览器端）
typed-codec.ts     # 类型感知 JS 序列化（Map/Set/BigInt → JSON）
ws-rpc.ts          # WebSocket 请求/响应模式
ws-client.ts       # 浏览器 WebSocket 连接管理（心跳/重连）
broadcast-relay.ts # BroadcastChannel 跨 region 消息中继
node-registry.ts   # DenoKV 节点注册与状态追踪
```

## 来源说明

以下模块提取自 `Projects/core/`（SGR 框架原型，你编程初期的全栈框架实验）：

| 模块                   | 来源                                                | 重构说明                                                  |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| `binary-chunk.ts`      | `serve.js` → `$decompose`                           | 纯函数，0xFF×4 分隔符扫描                                 |
| `bytes-codec.ts`       | `serve.js` → `$encoder/$deliver`                    | 纯函数 TS，支持 20+ 类型的递归序列化                      |
| `crypto-dice.ts`       | `serve.js` → `CryptoDice`                           | 纯函数 TS，原 class static method                         |
| `qrcode.ts`            | `serve.js` → `$QrcodeEngine`                        | 纯函数 TS，~1640 行，覆盖完整 QR 编码                     |
| `swt.ts`               | `serve.js` → `Account`                              | 纯函数 TS，Web Crypto API，双密钥轮换                     |
| `opfs-finder.ts`       | `opfsFinder.js`                                     | TS Web Component + Worker 隔离                            |
| `idb-engine.ts`        | `serve.js` → `ProxyServer.atomic`                   | 纯函数 TS，IndexedDB CRUD 完整抽象                        |
| `island-notice.ts`     | `island-notice.js`                                  | TS Web Component + 全局管理器                             |
| `wechat-dat.ts`        | `hiverepo` git 历史 → `decrypt_wechat_datfile.js`   | XOR 解密微信 .dat 文件                                    |
| `comic-deobfuscate.ts` | `hiverepo` git 历史 → `get_comic.js`                | 腾讯动漫混淆数据反混淆+解码                               |
| `hotlist-crawler.ts`   | `hiverepo` git 历史 → `craw.js`                     | 多平台热榜聚合爬虫（tophub/微博/知乎）                    |
| `livp-codec.ts`        | `pmp` → `mergeLivePhoto` / `parseLivePhoto`         | .livp 二进制格式编解码（Apple Live Photo 容器）           |
| `ffmpeg-pipeline.ts`   | `pmp` → `convertVideoToAV1WebM` / `convertMovToMp4` | ffmpeg.wasm 通用转换管线 + WebM/MP4 预设（浏览器端）      |
| `spatial-index.ts`     | `toys` → `nn`                                       | Haversine 球面距离 + R-tree 最近邻搜索（纯数学）          |
| `dedup-files.ts`       | `toys` → `findRepeatFiles`                          | 运行时无关文件查重 — Worker池 SHA-256 + 可注入 I/O 适配器 |

注意：旧本地 `LivpExplorer` SwiftUI 原型设想的 `.livp` 是 ZIP
容器（`live.heic`、`live.mov`、`metadata.json`），与当前 `livp-codec.ts`
的二进制容器格式不同。后续如在 `domains/LivpExplorer/` 支持 `.livp` 导入/导出，应先确定
canonical 格式或显式兼容两种格式。

## ScopedKv 模式

业务 domain 不应直接拼接全局 KV key。调用方通过 `getDomainKv(domain)` 获取 scoped
实例，然后只传 domain 内部相对 key。

```ts
const scoped = await getDomainKv("downip");
await scoped?.set(["home"], { ipv6: "2001:db8::1", port: 3000 });
```

实际写入的 key 会自动加上前缀：

```text
["domains", "downip", "home"]
```

## 运行时边界

- `getDomainKv()` 返回 `ScopedKv | null`。
- 返回 `null` 表示当前环境不可用 Deno KV，业务层必须显式处理 fallback。
- `_shared` 不保存业务默认值，不理解具体 domain 的 key 结构，也不负责数据迁移。
- 浏览器端模块（`opfs-finder.ts`、`island-notice.ts`、`opfs-engine.ts`）需要 DOM 环境，
  Deno deny 检查会报 `HTMLElement` 未定义的错误，这是预期行为。

## 验证

```bash
# Server-side 模块检查
deno check domains/_shared/qrcode.ts
deno check domains/_shared/crypto-dice.ts

# 完整检查
deno task check
```
