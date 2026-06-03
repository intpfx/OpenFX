export type StoreKey = string;
export type StoreKeyPrefix = string;

export interface ListOptions {
  limit?: number;
  reverse?: boolean;
}

export interface KvEntry<T> {
  key: StoreKey;
  value: T;
}

export interface KvStore {
  get<T>(key: StoreKey): Promise<T | null>;
  set<T>(key: StoreKey, value: T): Promise<void>;
  delete(key: StoreKey): Promise<void>;
  list<T>(prefix: StoreKeyPrefix, options?: ListOptions): AsyncIterable<KvEntry<T>>;
}

export class InMemoryKvStore implements KvStore {
  readonly #entries = new Map<StoreKey, unknown>();

  get<T>(key: StoreKey): Promise<T | null> {
    return Promise.resolve(this.#entries.has(key) ? this.#entries.get(key) as T : null);
  }

  set<T>(key: StoreKey, value: T): Promise<void> {
    this.#entries.set(key, value);
    return Promise.resolve();
  }

  delete(key: StoreKey): Promise<void> {
    this.#entries.delete(key);
    return Promise.resolve();
  }

  async *list<T>(
    prefix: StoreKeyPrefix,
    options: ListOptions = {},
  ): AsyncIterable<KvEntry<T>> {
    const keys = [...this.#entries.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort();

    if (options.reverse) {
      keys.reverse();
    }

    const limitedKeys = typeof options.limit === "number"
      ? keys.slice(0, options.limit)
      : keys;

    for (const key of limitedKeys) {
      yield { key, value: this.#entries.get(key) as T };
    }
  }
}
