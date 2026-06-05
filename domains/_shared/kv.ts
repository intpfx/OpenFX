type KvKeyPart = Deno.KvKeyPart;

// ── SSE 实时推送模式（from intpfx/dss） ──

export type KvEntryEvent = { key: Deno.KvKey; value: unknown };

// 对 ScopedKv 的某个前缀范围创建 SSE ReadableStream
// 先全量 list 已有数据，再 watch 每个 key 的实时变更
export const streamKvEntries = (
  kv: Deno.Kv,
  prefix: Deno.KvKey = [],
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const watchTasks: Promise<void>[] = [];

      for await (const entry of kv.list<unknown>({ prefix })) {
        const event: KvEntryEvent = { key: entry.key, value: entry.value };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

        // 为每个 key 挂 watch，变更时实时推送
        watchTasks.push(
          (async () => {
            const watcher = kv.watch([entry.key]);
            for await (const changes of watcher) {
              const change = changes[0];
              const ev: KvEntryEvent = { key: change.key, value: change.value };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
            }
          })(),
        );
      }

      // 保持流打开，直到所有 watch 被客户端断开
      await Promise.all(watchTasks);
    },
  });
};

// 使用方式：
//   const kv = await getKv();
//   const stream = streamKvEntries(kv, ["domains", "my-domain"]);
// 返回的 stream 可直接作为 Response body：new Response(stream, { headers: { "Content-Type": "text/event-stream" } })

// ScopedKv 类 — 自动给所有 key 加 domain 前缀
export class ScopedKv {
  constructor(private kv: Deno.Kv, private scope: KvKeyPart[]) {}

  async get<T>(key: KvKeyPart[]): Promise<T | null> {
    const result = await this.kv.get<T>([...this.scope, ...key]);
    return result.value ?? null;
  }

  async set(key: KvKeyPart[], value: unknown): Promise<void> {
    await this.kv.set([...this.scope, ...key], value);
  }

  async delete(key: KvKeyPart[]): Promise<void> {
    await this.kv.delete([...this.scope, ...key]);
  }

  async list<T>(prefix: KvKeyPart[]): Promise<Deno.KvEntry<T>[]> {
    const entries: Deno.KvEntry<T>[] = [];
    const iter = this.kv.list<T>({ prefix: [...this.scope, ...prefix] });
    for await (const entry of iter) {
      entries.push(entry);
    }
    return entries;
  }
}

// getKv 单例 — 全局共享一个 Deno.Kv 连接
let kv: Deno.Kv | null = null;
let memoryFallback = false;

export const getKv = async (): Promise<Deno.Kv> => {
  if (memoryFallback) throw new Error("Deno.Kv not available");
  if (kv) return kv;

  if (typeof Deno !== "undefined" && typeof Deno.openKv === "function") {
    kv = await Deno.openKv();
    return kv;
  }

  memoryFallback = true;
  throw new Error("Deno.Kv not available in this environment");
};

export const createScopedKv = (_domain: string): ScopedKv | null => {
  // Returns null when Deno.Kv is unavailable — caller must handle
  return null; // placeholder, real instance created after getKv()
};

// Factory: get a scoped KV by domain. Returns null if Deno.Kv unavailable.
export const getDomainKv = async (domain: string): Promise<ScopedKv | null> => {
  try {
    const instance = await getKv();
    return new ScopedKv(instance, ["domains", domain]);
  } catch {
    return null;
  }
};
