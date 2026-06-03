import type { PriceRecord, ProductEntry } from "../core/types.ts";
import { getDomainKv } from "../../_shared/kv.ts";
import type { ScopedKv } from "../../_shared/kv.ts";

export interface HowMuchStore {
  addRecord(
    productName: string,
    record: PriceRecord,
    timestamp: string,
  ): Promise<boolean>;
  getRecords(productName: string): Promise<ProductEntry[]>;
  reportRecord(productName: string, timestamp: string): Promise<boolean>;
  getSuggestions(query: string): Promise<string[]>;
  clearAll(): Promise<void>;
}

let storePromise: Promise<HowMuchStore> | null = null;
let memoryStore: HowMuchStore | null = null;

const updateProductIndex = async (
  scoped: ScopedKv,
  productName: string,
): Promise<void> => {
  const indexKey = ["index", "productName"];
  const existing = await scoped.get<string[]>(indexKey);
  const names = existing ?? [];
  if (!names.includes(productName)) {
    names.push(productName);
    await scoped.set(indexKey, names);
  }
};

export const getHowMuchStore = async (): Promise<HowMuchStore> => {
  if (storePromise !== null) {
    return await storePromise;
  }

  const scoped = await getDomainKv("how-much");

  if (scoped === null) {
    memoryStore ??= createMemoryHowMuchStore();
    storePromise = Promise.resolve(memoryStore);
    return await storePromise;
  }

  storePromise = Promise.resolve({
    async addRecord(
      productName: string,
      record: PriceRecord,
      timestamp: string,
    ): Promise<boolean> {
      try {
        const key = [productName, timestamp];
        await scoped.set(key, record);
        await updateProductIndex(scoped, productName);
        return true;
      } catch {
        return false;
      }
    },

    async getRecords(productName: string): Promise<ProductEntry[]> {
      try {
        const entries = await scoped.list<PriceRecord>([productName]);
        const results: ProductEntry[] = [];
        for (const entry of entries) {
          const timestamp = entry.key[entry.key.length - 1];
          results.push({
            productName,
            ...entry.value,
            timestamp: typeof timestamp === "string" ? timestamp : "",
          });
        }
        results.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() -
            new Date(a.timestamp).getTime(),
        );
        return results;
      } catch {
        return [];
      }
    },

    async reportRecord(
      productName: string,
      timestamp: string,
    ): Promise<boolean> {
      try {
        const key = [productName, timestamp];
        const entry = await scoped.get<PriceRecord>(key);
        if (!entry) return false;

        const current = entry;
        current.reportCount = (current.reportCount || 0) + 1;
        await scoped.set(key, current);
        return true;
      } catch {
        return false;
      }
    },

    async getSuggestions(query: string): Promise<string[]> {
      try {
        const indexKey = ["index", "productName"];
        const result = await scoped.get<string[]>(indexKey);
        const names = result ?? [];

        if (query.trim() === "") {
          return names.slice(0, 20);
        }

        const lowerQuery = query.toLowerCase();
        return names.filter((name) => name.toLowerCase().includes(lowerQuery));
      } catch {
        return [];
      }
    },

    async clearAll(): Promise<void> {
      const entries = await scoped.list<unknown>([]);
      for (const entry of entries) {
        // Strip the scope prefix (["domains", "how-much"]) from the key
        await scoped.delete(entry.key.slice(2));
      }
    },
  });

  return await storePromise;
};

export const createMemoryHowMuchStore = (): HowMuchStore => {
  const records = new Map<string, ProductEntry[]>();
  const index = new Set<string>();

  const ensureIndex = (productName: string) => {
    if (!records.has(productName)) {
      records.set(productName, []);
    }
    index.add(productName);
  };

  return {
    addRecord(
      productName: string,
      record: PriceRecord,
      timestamp: string,
    ): Promise<boolean> {
      ensureIndex(productName);
      records.get(productName)!.push({
        productName,
        ...record,
        timestamp,
      });
      return Promise.resolve(true);
    },

    getRecords(productName: string): Promise<ProductEntry[]> {
      const entries = records.get(productName) ?? [];
      return Promise.resolve(
        entries.slice().sort(
          (a, b) =>
            new Date(b.timestamp).getTime() -
            new Date(a.timestamp).getTime(),
        ),
      );
    },

    reportRecord(
      productName: string,
      timestamp: string,
    ): Promise<boolean> {
      const entries = records.get(productName);
      if (!entries) return Promise.resolve(false);
      const entry = entries.find((e) => e.timestamp === timestamp);
      if (!entry) return Promise.resolve(false);
      entry.reportCount = (entry.reportCount || 0) + 1;
      return Promise.resolve(true);
    },

    getSuggestions(query: string): Promise<string[]> {
      const names = Array.from(index);
      if (query.trim() === "") return Promise.resolve(names.slice(0, 20));
      const lowerQuery = query.toLowerCase();
      return Promise.resolve(
        names.filter((name) => name.toLowerCase().includes(lowerQuery)),
      );
    },

    clearAll(): Promise<void> {
      records.clear();
      index.clear();
      return Promise.resolve();
    },
  };
};
