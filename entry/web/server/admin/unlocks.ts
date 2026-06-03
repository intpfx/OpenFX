const UNLOCK_PREFIX = ["homepage-unlocks"] as const;
const memoryRules = new Map<string, UnlockRule>();

export type UnlockRule = {
  key: string;
  label: string;
  projectIds: string[];
  expiresAt: string;
};

const GENERATED_KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let kvPromise: Promise<Deno.Kv | null> | null = null;

const getEnvString = (name: string): string => {
  if (typeof Deno !== "undefined") {
    return (Deno.env.get(name) ?? "").trim();
  }

  const processEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  return (processEnv?.[name] ?? "").trim();
};

const getKv = async (): Promise<Deno.Kv | null> => {
  if (typeof Deno === "undefined" || typeof Deno.openKv !== "function") {
    return null;
  }

  if (kvPromise === null) {
    kvPromise = Deno.openKv().catch(() => null);
  }
  return await kvPromise;
};

export const getAdminUnlockKey = (): string => {
  const configured = getEnvString("OPENFX_ADMIN_KEY");
  if (configured) {
    return configured;
  }

  return getEnvString("DENO_DEPLOYMENT_ID") ? "" : "TEST";
};

export const validateUnlockRule = (rule: UnlockRule): string | null => {
  if (
    rule.key.toLowerCase() === "update" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(rule.key)
  ) {
    return "unlock key 必须是安全 key 格式，且不能使用保留字";
  }

  if (!rule.label.trim()) {
    return "label 不能为空";
  }

  if (rule.projectIds.length === 0) {
    return "至少选择一个业务";
  }

  const expiresAt = Date.parse(rule.expiresAt);
  if (Number.isNaN(expiresAt)) {
    return "过期时间格式无效";
  }

  if (expiresAt <= Date.now()) {
    return "过期时间必须晚于当前时间";
  }

  return null;
};

export const isUnlockRuleExpired = (
  rule: Pick<UnlockRule, "expiresAt">,
  now = Date.now(),
): boolean => {
  return Date.parse(rule.expiresAt) <= now;
};

export const generateUnlockKey = (length = 5): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let output = "";
  for (const byte of bytes) {
    output += GENERATED_KEY_ALPHABET[byte % GENERATED_KEY_ALPHABET.length];
  }
  return output;
};

export const generateUniqueUnlockKey = async (length = 5): Promise<string> => {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = generateUnlockKey(length);
    if ((await getUnlockRule(candidate)) === null) {
      return candidate;
    }
  }

  throw new Error("failed_to_generate_unique_unlock_key");
};

export const listUnlockRules = async (): Promise<UnlockRule[]> => {
  const kv = await getKv();
  if (kv === null) {
    return [...memoryRules.values()].sort((left, right) =>
      left.key.localeCompare(right.key)
    );
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
  return !!adminKey && key.trim() === adminKey;
};
