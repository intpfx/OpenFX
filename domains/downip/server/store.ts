import {
  isProbablyIpv6,
  isValidEndpointKey,
  normalizeIpv6,
} from "../core/validation.ts";
import { getDomainKv } from "../../_shared/kv.ts";

export type RouteValue = {
  ipv6: string;
  port: number;
};

export type Mapping = Record<string, RouteValue>;

export interface DownipStore {
  list(): Promise<Mapping>;
  get(key: string): Promise<RouteValue | null>;
  set(key: string, value: RouteValue): Promise<void>;
}

let storePromise: Promise<DownipStore> | null = null;
let memoryStore: DownipStore | null = null;

const getEnvString = (name: string): string => {
  if (typeof Deno !== "undefined") {
    return (Deno.env.get(name) ?? "").trim();
  }

  const processEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  return (processEnv?.[name] ?? "").trim();
};

export const getDownipStore = async (): Promise<DownipStore> => {
  if (storePromise !== null) {
    return await storePromise;
  }

  const scoped = await getDomainKv("downip");

  if (scoped === null) {
    memoryStore ??= createMemoryDownipStore();
    storePromise = Promise.resolve(memoryStore);
    return await storePromise;
  }

  storePromise = Promise.resolve({
    async list(): Promise<Mapping> {
      const output: Mapping = {};
      const entries = await scoped.list<RouteValue>([]);

      for (const entry of entries) {
        // entry.key is ["domains", "downip", key]; extract key at index 2
        const key = entry.key[2];
        if (typeof key === "string") {
          output[key] = entry.value;
        }
      }

      return output;
    },
    async get(key: string): Promise<RouteValue | null> {
      return await scoped.get<RouteValue>([key]);
    },
    async set(key: string, value: RouteValue): Promise<void> {
      await scoped.set([key], value);
    },
  });

  return await storePromise;
};

export const createMemoryDownipStore = (
  initial?: Mapping,
): DownipStore => {
  const storage = new Map<string, RouteValue>(Object.entries(initial ?? {}));

  return {
    list(): Promise<Mapping> {
      return Promise.resolve(Object.fromEntries(storage.entries()));
    },
    get(key: string): Promise<RouteValue | null> {
      return Promise.resolve(storage.get(key) ?? null);
    },
    set(key: string, value: RouteValue): Promise<void> {
      storage.set(key, value);
      return Promise.resolve();
    },
  };
};

export { isProbablyIpv6, isValidEndpointKey, normalizeIpv6 };
export { getEnvString };
