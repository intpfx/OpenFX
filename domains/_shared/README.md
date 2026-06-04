# _shared

`_shared` 放置多个 domain 共用、但不属于具体产品业务的基础设施代码。当前核心能力是统一的
Deno KV 访问层。

## 当前职责

- 维护全仓库共享的 `Deno.Kv` 单例连接。
- 为每个 domain 提供带命名空间的 `ScopedKv`。
- 在当前运行时没有 `Deno.openKv` 时返回 `null`，让调用方自行降级到内存存储。

## 目录结构

```text
kv.ts  # ScopedKv、getKv、getDomainKv
```

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

## Admin KV 控制台

Web admin 页面提供一个面向维护者的 Deno KV CRUD 控制台。它直接操作完整 KV key，不走
`ScopedKv` 自动前缀：

```json
["domains", "downip", "home"]
```

控制台需要 admin key，仅用于调试、修复或迁移数据；业务代码仍应优先使用各 domain 的
scoped store。

## 已知使用方

| Domain     | Scope                     |
| ---------- | ------------------------- |
| `downip`   | `["domains", "downip"]`   |
| `how-much` | `["domains", "how-much"]` |

## 验证

共享 KV 代码由使用方测试间接覆盖。修改这里后至少运行：

```bash
deno task check
```
