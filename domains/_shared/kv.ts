type KvKeyPart = Deno.KvKeyPart;

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
