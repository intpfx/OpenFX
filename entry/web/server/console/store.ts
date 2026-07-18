export type ConsoleKeyPart = string | number | boolean;
export type ConsoleKey = readonly ConsoleKeyPart[];

export interface ConsoleStoreEntry<T = unknown> {
  key: ConsoleKey;
  value: T;
  versionstamp: string;
}

export interface ConsoleStore {
  get<T>(key: ConsoleKey): Promise<ConsoleStoreEntry<T> | null>;
  set(key: ConsoleKey, value: unknown): Promise<void>;
  delete(key: ConsoleKey): Promise<void>;
  list<T>(prefix: ConsoleKey): Promise<ConsoleStoreEntry<T>[]>;
  compareAndSet(
    key: ConsoleKey,
    expectedVersionstamp: string | null,
    value: unknown,
  ): Promise<boolean>;
}

type MemoryEntry = { key: ConsoleKey; value: unknown; version: number };

export const createMemoryConsoleStore = (): ConsoleStore => {
  const entries = new Map<string, MemoryEntry>();
  let nextVersion = 1;

  const get = <T>(key: ConsoleKey): ConsoleStoreEntry<T> | null => {
    const entry = entries.get(serializeKey(key));
    return entry
      ? {
        key: [...entry.key],
        value: structuredClone(entry.value) as T,
        versionstamp: String(entry.version),
      }
      : null;
  };

  return {
    get(key) {
      return Promise.resolve(get(key));
    },
    set(key, value) {
      entries.set(serializeKey(key), {
        key: [...key],
        value: structuredClone(value),
        version: nextVersion++,
      });
      return Promise.resolve();
    },
    delete(key) {
      entries.delete(serializeKey(key));
      return Promise.resolve();
    },
    list<T>(prefix: ConsoleKey) {
      const values = Array.from(entries.values())
        .filter((entry) => hasPrefix(entry.key, prefix))
        .sort((left, right) =>
          serializeKey(left.key).localeCompare(serializeKey(right.key))
        )
        .map((entry) => ({
          key: [...entry.key],
          value: structuredClone(entry.value) as T,
          versionstamp: String(entry.version),
        }));
      return Promise.resolve(values);
    },
    compareAndSet(key, expectedVersionstamp, value) {
      const current = get(key);
      if ((current?.versionstamp ?? null) !== expectedVersionstamp) {
        return Promise.resolve(false);
      }
      entries.set(serializeKey(key), {
        key: [...key],
        value: structuredClone(value),
        version: nextVersion++,
      });
      return Promise.resolve(true);
    },
  };
};

export const createDenoConsoleStore = (kv: Deno.Kv): ConsoleStore => ({
  async get<T>(key: ConsoleKey) {
    const entry = await kv.get<T>([...key]);
    return entry.value === null ? null : {
      key: entry.key as ConsoleKey,
      value: entry.value,
      versionstamp: entry.versionstamp!,
    };
  },
  async set(key, value) {
    await kv.set([...key], value);
  },
  async delete(key) {
    await kv.delete([...key]);
  },
  async list<T>(prefix: ConsoleKey) {
    const entries: ConsoleStoreEntry<T>[] = [];
    for await (const entry of kv.list<T>({ prefix: [...prefix] })) {
      if (entry.value !== null && entry.versionstamp !== null) {
        entries.push({
          key: entry.key as ConsoleKey,
          value: entry.value,
          versionstamp: entry.versionstamp,
        });
      }
    }
    return entries;
  },
  async compareAndSet(key, expectedVersionstamp, value) {
    const result = await kv.atomic()
      .check({ key: [...key], versionstamp: expectedVersionstamp })
      .set([...key], value)
      .commit();
    return result.ok;
  },
});

const serializeKey = (key: ConsoleKey): string => JSON.stringify(key);

const hasPrefix = (key: ConsoleKey, prefix: ConsoleKey): boolean =>
  prefix.every((part, index) => key[index] === part);

let defaultStorePromise: Promise<ConsoleStore> | null = null;

export const getDefaultConsoleStore = (): Promise<ConsoleStore> => {
  if (defaultStorePromise === null) {
    defaultStorePromise = (async () => {
      try {
        return createDenoConsoleStore(await Deno.openKv());
      } catch {
        return createMemoryConsoleStore();
      }
    })();
  }
  return defaultStorePromise;
};
