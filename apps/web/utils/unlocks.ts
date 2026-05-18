import { isValidEndpointKey } from "../../../packages/core/src/mod.ts";

const UNLOCK_PREFIX = ["homepage-unlocks"] as const;
const memoryRules = new Map<string, UnlockRule>();

export type UnlockRule = {
  key: string;
  label: string;
  projectIds: string[];
  hint?: string;
};

let kvPromise: Promise<Deno.Kv | null> | null = null;

const getKv = async (): Promise<Deno.Kv | null> => {
  if (typeof Deno.openKv !== "function") {
    return null;
  }

  if (kvPromise === null) {
    kvPromise = Deno.openKv().catch(() => null);
  }
  return await kvPromise;
};

export const getAdminUnlockKey = (): string => {
  const configured = (Deno.env.get("OPENFX_ADMIN_KEY") ?? "").trim();
  if (configured) {
    return configured;
  }

  return Deno.env.get("DENO_DEPLOYMENT_ID") ? "" : "TEST";
};

export const validateUnlockRule = (rule: UnlockRule): string | null => {
  if (!isValidEndpointKey(rule.key)) {
    return "unlock key 必须是安全 key 格式，且不能使用保留字";
  }

  if (!rule.label.trim()) {
    return "label 不能为空";
  }

  if (rule.projectIds.length === 0) {
    return "至少选择一个业务";
  }

  return null;
};

export const listUnlockRules = async (): Promise<UnlockRule[]> => {
  const kv = await getKv();
  if (kv === null) {
    return [...memoryRules.values()].sort((left, right) => left.key.localeCompare(right.key));
  }

  const rules: UnlockRule[] = [];

  for await (const entry of kv.list<UnlockRule>({ prefix: [...UNLOCK_PREFIX] })) {
    if (entry.value) {
      rules.push(entry.value);
    }
  }

  return rules.sort((left, right) => left.key.localeCompare(right.key));
};

export const getUnlockRule = async (key: string): Promise<UnlockRule | null> => {
  const kv = await getKv();
  if (kv === null) {
    return memoryRules.get(key) ?? null;
  }

  const result = await kv.get<UnlockRule>([...UNLOCK_PREFIX, key]);
  return result.value ?? null;
};

export const saveUnlockRule = async (rule: UnlockRule): Promise<void> => {
  const kv = await getKv();
  if (kv === null) {
    memoryRules.set(rule.key, rule);
    return;
  }

  await kv.set([...UNLOCK_PREFIX, rule.key], rule);
};

export const deleteUnlockRule = async (key: string): Promise<void> => {
  const kv = await getKv();
  if (kv === null) {
    memoryRules.delete(key);
    return;
  }

  await kv.delete([...UNLOCK_PREFIX, key]);
};

export const isAdminUnlockKey = (key: string): boolean => {
  const adminKey = getAdminUnlockKey();
  return !!adminKey && key === adminKey;
};
