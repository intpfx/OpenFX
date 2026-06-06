# DenoKV SSE 实时推送模式

从 `intpfx/dss` 项目提取的 DenoKV SSE 流式推送模式。**该模式已在 `domains/_shared/kv.ts`
中实现为 `streamKvEntries()` 函数**，不再需要手工拼凑。

## 现成的 API

```ts
import { getKv, streamKvEntries } from "../../_shared/kv.ts";

const kv = await getKv();
const stream = streamKvEntries(kv, ["domains", "my-domain"]);
return new Response(stream, {
  headers: { "Content-Type": "text/event-stream" },
});
```

`streamKvEntries(kv, prefix)` 返回 `ReadableStream<Uint8Array>`，SSE 格式每行
`data: {"key":...,"value":...}\n\n`。

## 核心模式（算法参考）

自己手动拼的实现逻辑：

用一个 `ReadableStream` 暴露 SSE 端点，同时推送：

1. **全量快照** — `db.list({ prefix: [] })` 遍历所有已有条目
2. **实时变更** — 每个 key 启动一个 `db.watch()` 协程，变更时推送到同一个 stream

```ts
const db = await Deno.openKv();
const entries = db.list({ prefix: [] });
const encoder = new TextEncoder();
const watchTasks = [];

const stream = new ReadableStream({
  async start(controller) {
    for await (const entry of entries) {
      const data = `data: ${
        JSON.stringify({ key: entry.key, value: entry.value })
      }\n\n`;
      controller.enqueue(encoder.encode(data));

      const task = (async () => {
        const watcher = db.watch([entry.key]);
        for await (const change of watcher) {
          const data = `data: ${
            JSON.stringify({ key: change[0].key, value: change[0].value })
          }\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      })();
      watchTasks.push(task);
    }
    await Promise.all(watchTasks);
  },
});

headers.set("Content-Type", "text/event-stream");
return new Response(stream, { status: 200, headers });
```

## 关键组件

| 组件                      | 作用                           |
| ------------------------- | ------------------------------ |
| `db.list({ prefix: [] })` | 遍历 KV 条目（异步迭代器）     |
| `db.watch([key])`         | 监听单个 key 变更（持续阻塞）  |
| `ReadableStream`          | 推全量+增量给客户端            |
| `text/event-stream`       | SSE MIME，`EventSource` 可消费 |

## 变体

- **按 prefix 监听**：给 list/watch 相同 prefix，只关注某 domain
- **增量只推 value**：key 列表固定时可简化为推送 value
- **取消清理**：`ReadableStream` 的 `cancel()` 回调中关闭 db 连接

## 与 OpenFX 现有 `_shared/kv.ts` 关系

`ScopedKv` 已有 get/set/delete/list，没有流式能力。 需要实时推送时可在 `_shared/kv.ts`
中新增：

```ts
function streamScope(prefix: KvKeyPart[], signal?: AbortSignal): ReadableStream;
```

按 domain scope 限制监听范围，避免跨 domain 数据泄漏。

## 来源

- 项目：`github.com/intpfx/dss`（实验原型，2024-11）
- JSR 依赖 `@intpfx/fx` 已归档、所有版本 yanked
- 不推荐整库并入 OpenFX，仅提取此模式复用
