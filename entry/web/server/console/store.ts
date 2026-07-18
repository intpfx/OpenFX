export type ConsoleKeyPart = string | number | boolean;
export type ConsoleKey = readonly ConsoleKeyPart[];

export interface ConsoleStoreEntry<T = unknown> {
  key: ConsoleKey;
  value: T;
  versionstamp: string;
}

export interface ConsoleSetOptions {
  expireIn?: number;
}

export interface ConsoleListOptions {
  prefix: ConsoleKey;
  start?: ConsoleKey;
  end?: ConsoleKey;
  limit?: number;
}

export interface ConsoleAtomicCheck {
  key: ConsoleKey;
  versionstamp: string | null;
}

export interface ConsoleAtomicSet {
  key: ConsoleKey;
  value: unknown;
  options?: ConsoleSetOptions;
}

export interface ConsoleAtomicOperation {
  checks: ConsoleAtomicCheck[];
  sets: ConsoleAtomicSet[];
  deletes?: ConsoleKey[];
}

export interface ConsoleStore {
  get<T>(key: ConsoleKey): Promise<ConsoleStoreEntry<T> | null>;
  set(key: ConsoleKey, value: unknown, options?: ConsoleSetOptions): Promise<void>;
  delete(key: ConsoleKey): Promise<void>;
  list<T>(options: ConsoleListOptions): Promise<ConsoleStoreEntry<T>[]>;
  atomic(operation: ConsoleAtomicOperation): Promise<boolean>;
  compareAndSet(
    key: ConsoleKey,
    expectedVersionstamp: string | null,
    value: unknown,
    options?: ConsoleSetOptions,
  ): Promise<boolean>;
}

type MemoryEntry = {
  key: ConsoleKey;
  value: unknown;
  version: number;
  expiresAt?: number;
};

export interface MemoryConsoleStoreOptions {
  now?: () => number;
}

export const createMemoryConsoleStore = (
  options: MemoryConsoleStoreOptions = {},
): ConsoleStore => {
  const entries = new Map<string, MemoryEntry>();
  const now = options.now ?? Date.now;
  let nextVersion = 1;

  const purgeExpired = (): void => {
    const timestamp = now();
    for (const [serialized, entry] of entries) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= timestamp) {
        entries.delete(serialized);
      }
    }
  };

  const get = <T>(key: ConsoleKey): ConsoleStoreEntry<T> | null => {
    purgeExpired();
    const entry = entries.get(serializeKey(key));
    return entry
      ? {
        key: [...entry.key],
        value: structuredClone(entry.value) as T,
        versionstamp: String(entry.version),
      }
      : null;
  };

  const write = (
    key: ConsoleKey,
    value: unknown,
    setOptions?: ConsoleSetOptions,
  ): void => {
    entries.set(serializeKey(key), {
      key: [...key],
      value: structuredClone(value),
      version: nextVersion++,
      expiresAt: setOptions?.expireIn === undefined
        ? undefined
        : now() + setOptions.expireIn,
    });
  };

  const store: ConsoleStore = {
    get(key) {
      return Promise.resolve(get(key));
    },
    set(key, value, setOptions) {
      purgeExpired();
      write(key, value, setOptions);
      return Promise.resolve();
    },
    delete(key) {
      purgeExpired();
      entries.delete(serializeKey(key));
      return Promise.resolve();
    },
    list<T>(listOptions: ConsoleListOptions) {
      purgeExpired();
      const values = Array.from(entries.values())
        .filter((entry) => hasPrefix(entry.key, listOptions.prefix))
        .filter((entry) =>
          listOptions.start === undefined ||
          compareKeys(entry.key, listOptions.start) >= 0
        )
        .filter((entry) =>
          listOptions.end === undefined || compareKeys(entry.key, listOptions.end) < 0
        )
        .sort((left, right) => compareKeys(left.key, right.key))
        .slice(0, listOptions.limit)
        .map((entry) => ({
          key: [...entry.key],
          value: structuredClone(entry.value) as T,
          versionstamp: String(entry.version),
        }));
      return Promise.resolve(values);
    },
    atomic(operation) {
      purgeExpired();
      for (const check of operation.checks) {
        const current = get(check.key);
        if ((current?.versionstamp ?? null) !== check.versionstamp) {
          return Promise.resolve(false);
        }
      }
      for (const key of operation.deletes ?? []) entries.delete(serializeKey(key));
      for (const item of operation.sets) write(item.key, item.value, item.options);
      return Promise.resolve(true);
    },
    compareAndSet(key, expectedVersionstamp, value, setOptions) {
      return store.atomic({
        checks: [{ key, versionstamp: expectedVersionstamp }],
        sets: [{ key, value, options: setOptions }],
      });
    },
  };
  return store;
};

export const createDenoConsoleStore = (kv: Deno.Kv): ConsoleStore => {
  const store: ConsoleStore = {
    async get<T>(key: ConsoleKey) {
      return await wrapDenoKvFailure(async () => {
        const entry = await kv.get<T>([...key]);
        return entry.value === null ? null : {
          key: entry.key as ConsoleKey,
          value: entry.value,
          versionstamp: entry.versionstamp!,
        };
      });
    },
    async set(key, value, options) {
      await wrapDenoKvFailure(() => kv.set([...key], value, options));
    },
    async delete(key) {
      await wrapDenoKvFailure(() => kv.delete([...key]));
    },
    async list<T>(options: ConsoleListOptions) {
      return await wrapDenoKvFailure(async () => {
        const entries: ConsoleStoreEntry<T>[] = [];
        const selector: Deno.KvListSelector = options.start || options.end
          ? {
            prefix: [...options.prefix],
            start: options.start ? [...options.start] : undefined,
            end: options.end ? [...options.end] : undefined,
          }
          : { prefix: [...options.prefix] };
        for await (
          const entry of kv.list<T>(selector, {
            limit: options.limit,
          })
        ) {
          if (entry.value !== null && entry.versionstamp !== null) {
            entries.push({
              key: entry.key as ConsoleKey,
              value: entry.value,
              versionstamp: entry.versionstamp,
            });
          }
        }
        return entries;
      });
    },
    async atomic(operation) {
      return await wrapDenoKvFailure(async () => {
        let atomic = kv.atomic();
        for (const check of operation.checks) {
          atomic = atomic.check({
            key: [...check.key],
            versionstamp: check.versionstamp,
          });
        }
        for (const key of operation.deletes ?? []) atomic = atomic.delete([...key]);
        for (const item of operation.sets) {
          atomic = atomic.set([...item.key], item.value, item.options);
        }
        return (await atomic.commit()).ok;
      });
    },
    compareAndSet(key, expectedVersionstamp, value, options) {
      return store.atomic({
        checks: [{ key, versionstamp: expectedVersionstamp }],
        sets: [{ key, value, options }],
      });
    },
  };
  return store;
};

export class ConsoleStoreUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("OpenFX console store is unavailable.", { cause });
    this.name = "ConsoleStoreUnavailableError";
  }
}

const wrapDenoKvFailure = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ConsoleStoreUnavailableError) throw error;
    throw new ConsoleStoreUnavailableError(error);
  }
};

export const createDefaultConsoleStore = async (
  openKv: () => Promise<Deno.Kv> = () => Deno.openKv(),
): Promise<ConsoleStore> => {
  try {
    return createDenoConsoleStore(await openKv());
  } catch (error) {
    throw new ConsoleStoreUnavailableError(error);
  }
};

const serializeKey = (key: ConsoleKey): string => JSON.stringify(key);

const compareKeys = (left: ConsoleKey, right: ConsoleKey): number =>
  serializeKey(left).localeCompare(serializeKey(right), "en", { numeric: true });

const hasPrefix = (key: ConsoleKey, prefix: ConsoleKey): boolean =>
  prefix.every((part, index) => key[index] === part);

let defaultStorePromise: Promise<ConsoleStore> | null = null;

export const getDefaultConsoleStore = (): Promise<ConsoleStore> =>
  defaultStorePromise ??= createDefaultConsoleStore();
