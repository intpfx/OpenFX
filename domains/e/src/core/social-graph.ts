import type { KvStore } from "../interfaces/kv-store.ts";
import type { PeerMessage, SocialRelation, SubagentTask } from "./types.ts";

export interface SocialGraphOptions {
  store: KvStore;
  now?: () => number;
  createId?: () => string;
}

export class SocialGraph {
  readonly #store: KvStore;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: SocialGraphOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  async recordPeerMessage(message: PeerMessage): Promise<SocialRelation> {
    return await this.#upsert(
      message.envelope.senderAgentId,
      message.envelope.targetAgentId,
      "collaborator",
      outcomeFromState(message.state),
    );
  }

  async recordSubagentTask(task: SubagentTask): Promise<SocialRelation> {
    return await this.#upsert(
      task.parentAgentId,
      task.agentId,
      "reviewer",
      task.state === "completed"
        ? "success"
        : task.state === "failed"
        ? "failure"
        : "unknown",
    );
  }

  async listRelations(agentId: string): Promise<SocialRelation[]> {
    const relations: SocialRelation[] = [];
    for await (
      const entry of this.#store.list<SocialRelation>(socialRelationPrefix(agentId))
    ) {
      relations.push(entry.value);
    }
    return relations.sort((a, b) => b.trust - a.trust || b.updatedAt - a.updatedAt);
  }

  async rankPeers(agentId: string, _capability: string): Promise<SocialRelation[]> {
    return await this.listRelations(agentId);
  }

  async #upsert(
    agentId: string,
    peerAgentId: string,
    label: SocialRelation["label"],
    outcome: SocialRelation["lastOutcome"],
  ): Promise<SocialRelation> {
    const key = socialRelationKey(agentId, peerAgentId, label);
    const existing = await this.#store.get<SocialRelation>(key);
    const relation: SocialRelation = {
      id: existing?.id ?? this.#createId(),
      agentId,
      peerAgentId,
      label,
      trust: clampTrust((existing?.trust ?? 0.5) + trustDelta(outcome)),
      interactions: (existing?.interactions ?? 0) + 1,
      lastOutcome: outcome,
      updatedAt: this.#now(),
    };
    await this.#store.set(key, relation);
    return relation;
  }
}

export function socialRelationPrefix(agentId: string): string {
  return `agent:${agentId}:social:relation:`;
}

export function socialRelationKey(
  agentId: string,
  peerAgentId: string,
  label: SocialRelation["label"],
): string {
  return `${socialRelationPrefix(agentId)}${label}:${peerAgentId}`;
}

function outcomeFromState(state: PeerMessage["state"]): SocialRelation["lastOutcome"] {
  if (state === "completed") return "success";
  if (state === "expired") return "timeout";
  if (state === "failed" || state === "cancelled") return "failure";
  return "unknown";
}

function trustDelta(outcome: SocialRelation["lastOutcome"]): number {
  if (outcome === "success") return 0.1;
  if (outcome === "failure" || outcome === "timeout") return -0.1;
  return 0;
}

function clampTrust(value: number): number {
  return Math.max(0, Math.min(1, value));
}
