/**
 * node-registry — DenoKV 节点注册与状态追踪
 *
 * from intpfx/esn (Edge Storage Node) — 分布式节点管理基础模式
 *
 * 纯函数式风格：每个操作接受 Deno.Kv 作为参数，返回新数据，不产生副作用。
 * 同时提供 `createNodeRegistry` 便利包装。
 *
 * 使用方式：
 *
 * ```ts
 * // 纯函数式
 * import { nodeOnline, nodeList } from "./node-registry.ts";
 * import { getKv } from "./kv.ts";
 *
 * const kv = await getKv();
 * await nodeOnline(kv, "uuid-xxx", { region: "us-west2", quota: "100 GB", usage: "30 GB", private: true });
 * const nodes = await nodeList(kv);
 *
 * // 或使用便利包装
 * import { createNodeRegistry } from "./node-registry.ts";
 * const registry = createNodeRegistry(kv);
 * await registry.online("uuid-xxx", { region: "us-west2", quota: "100 GB", usage: "30 GB", private: true });
 * ```
 *
 * @module
 */

// ── 类型定义 ──

export interface NodeInfo {
  serverRegions: string[];
  quota: string;
  usage: string;
  wallet: number;
  private: boolean;
  status: "online" | "offline";
  loginTime: number;
  onlineTime: number;
  uuid: string;
}

export type NodeInfoInput = Omit<NodeInfo, "uuid" | "status" | "loginTime" | "onlineTime" | "serverRegions" | "wallet">;

// ── 默认 KV 前缀 ──

const DEFAULT_PREFIX: Deno.KvKey = ["node"];
const nodeKey = (prefix: Deno.KvKey, uuid: string): Deno.KvKey => [...prefix, uuid];

// ── 纯函数：构建不可变的新 NodeInfo ──

const mergeNodeInfo = (
  existing: NodeInfo | null,
  uuid: string,
  input: NodeInfoInput,
): NodeInfo => {
  const now = Date.now();
  return {
    serverRegions: existing
      ? [...existing.serverRegions, input.region]
      : [input.region],
    quota: input.quota,
    usage: input.usage,
    wallet: existing?.wallet ?? 0,
    private: input.private,
    status: "online",
    loginTime: now,
    onlineTime: existing?.onlineTime ?? 0,
    uuid,
  };
};

// ── 纯函数：构建离线状态的 NodeInfo ──

const takeOffline = (node: NodeInfo, region: string): NodeInfo => ({
  ...node,
  status: "offline" as const,
  serverRegions: node.serverRegions.filter((r) => r !== region),
  onlineTime: node.onlineTime + (node.status === "online" ? Date.now() - node.loginTime : 0),
});

const applyHeartbeat = (
  node: NodeInfo,
  delta: Partial<Pick<NodeInfo, "usage" | "quota">>,
): NodeInfo => ({
  ...node,
  ...(delta.usage !== undefined ? { usage: delta.usage } : {}),
  ...(delta.quota !== undefined ? { quota: delta.quota } : {}),
});

// ── 纯函数式 API ──

/** 节点上线 */
export const nodeOnline = async (
  kv: Deno.Kv,
  uuid: string | null,
  input: NodeInfoInput,
  prefix: Deno.KvKey = DEFAULT_PREFIX,
): Promise<NodeInfo> => {
  const nodeId = uuid ?? crypto.randomUUID();
  const existing = uuid ? (await kv.get<NodeInfo>(nodeKey(prefix, uuid))).value : null;
  const node = mergeNodeInfo(existing, nodeId, input);
  await kv.set(nodeKey(prefix, nodeId), node);
  return node;
};

/** 心跳更新 */
export const nodeHeartbeat = async (
  kv: Deno.Kv,
  uuid: string,
  delta: Partial<Pick<NodeInfo, "usage" | "quota">>,
  prefix: Deno.KvKey = DEFAULT_PREFIX,
): Promise<void> => {
  const existing = (await kv.get<NodeInfo>(nodeKey(prefix, uuid))).value;
  if (!existing) return;
  await kv.set(nodeKey(prefix, uuid), applyHeartbeat(existing, delta));
};

/** 节点下线 */
export const nodeOffline = async (
  kv: Deno.Kv,
  uuid: string,
  region: string,
  prefix: Deno.KvKey = DEFAULT_PREFIX,
): Promise<void> => {
  const existing = (await kv.get<NodeInfo>(nodeKey(prefix, uuid))).value;
  if (!existing) return;
  await kv.set(nodeKey(prefix, uuid), takeOffline(existing, region));
};

/** 列出所有节点 */
export const nodeList = async (
  kv: Deno.Kv,
  prefix: Deno.KvKey = DEFAULT_PREFIX,
): Promise<NodeInfo[]> => {
  const entries = kv.list<NodeInfo>({ prefix });
  const nodes: NodeInfo[] = [];
  for await (const entry of entries) {
    nodes.push(entry.value);
  }
  return nodes;
};

/** 查询单个节点 */
export const nodeGet = async (
  kv: Deno.Kv,
  uuid: string,
  prefix: Deno.KvKey = DEFAULT_PREFIX,
): Promise<NodeInfo | null> => {
  const result = await kv.get<NodeInfo>(nodeKey(prefix, uuid));
  return result.value ?? null;
};

// ── 便利包装（兼容旧调用方式） ──

export interface NodeRegistry {
  online: (uuid: string | null, info: NodeInfoInput) => Promise<NodeInfo>;
  heartbeat: (uuid: string, delta: Partial<Pick<NodeInfo, "usage" | "quota">>) => Promise<void>;
  offline: (uuid: string, region: string) => Promise<void>;
  list: () => Promise<NodeInfo[]>;
  get: (uuid: string) => Promise<NodeInfo | null>;
}

export const createNodeRegistry = (
  kv: Deno.Kv,
  prefix: Deno.KvKey = DEFAULT_PREFIX,
): NodeRegistry => ({
  online: (uuid, info) => nodeOnline(kv, uuid, info, prefix),
  heartbeat: (uuid, delta) => nodeHeartbeat(kv, uuid, delta, prefix),
  offline: (uuid, region) => nodeOffline(kv, uuid, region, prefix),
  list: () => nodeList(kv, prefix),
  get: (uuid) => nodeGet(kv, uuid, prefix),
});
