import type { PeerCommunicationKernel } from "../core/peer-communication.ts";
import type { JsonSchema, KernelError, PeerMessage } from "../core/types.ts";
import type { KvStore } from "../interfaces/kv-store.ts";

export type SpeculativePeerReplyState =
  | "pending"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type PredictionComparison = "aligned" | "diverged" | "unknown";

export interface SendSpeculativePeerMessageInput<TInput = unknown> {
  senderAgentId: string;
  targetAgentId: string;
  body: TInput;
  prediction?: string;
  workingContext?: string;
  conversationId?: string;
  responseSchema?: JsonSchema;
  ttlMs?: number;
  maxHops?: number;
}

export interface SpeculativePeerReply<TInput = unknown, TResult = unknown> {
  id: string;
  peerMessageId: string;
  conversationId: string;
  senderAgentId: string;
  targetAgentId: string;
  body: TInput;
  prediction?: string;
  workingContext?: string;
  state: SpeculativePeerReplyState;
  comparison: PredictionComparison;
  result?: TResult;
  error?: KernelError;
  sentAt: number;
  receivedAt?: number;
  updatedAt: number;
  consumedAt?: number;
}

export interface SpeculativePeerCoordinatorOptions {
  store: KvStore;
  peers: PeerCommunicationKernel;
  now?: () => number;
}

export class SpeculativePeerCoordinator {
  readonly #store: KvStore;
  readonly #peers: PeerCommunicationKernel;
  readonly #now: () => number;

  constructor(options: SpeculativePeerCoordinatorOptions) {
    this.#store = options.store;
    this.#peers = options.peers;
    this.#now = options.now ?? Date.now;
  }

  async send<TInput = unknown>(
    input: SendSpeculativePeerMessageInput<TInput>,
  ): Promise<SpeculativePeerReply<TInput>> {
    const message = await this.#peers.send({
      senderAgentId: input.senderAgentId,
      targetAgentId: input.targetAgentId,
      body: input.body,
      conversationId: input.conversationId,
      responseSchema: input.responseSchema,
      ttlMs: input.ttlMs,
      maxHops: input.maxHops,
    });
    const reply: SpeculativePeerReply<TInput> = {
      id: message.envelope.id,
      peerMessageId: message.envelope.id,
      conversationId: message.envelope.conversationId,
      senderAgentId: input.senderAgentId,
      targetAgentId: input.targetAgentId,
      body: input.body,
      prediction: input.prediction,
      workingContext: input.workingContext,
      state: "pending",
      comparison: "unknown",
      sentAt: message.envelope.createdAt,
      updatedAt: this.#now(),
    };

    await this.#put(reply);
    return reply;
  }

  async sync<TResult = unknown>(
    peerMessageId: string,
  ): Promise<SpeculativePeerReply<unknown, TResult>> {
    const key = await this.#recordKeyForPeerMessage(peerMessageId);
    const current = await this.#store.get<SpeculativePeerReply<unknown, TResult>>(key);
    if (!current) {
      throw new Error(`Speculative peer reply not found: ${peerMessageId}`);
    }

    const message = await this.#peers.get(peerMessageId);
    if (!message) {
      const missing: SpeculativePeerReply<unknown, TResult> = {
        ...current,
        state: "failed",
        error: {
          code: "peer_message_missing",
          message: `Peer message not found: ${peerMessageId}.`,
        },
        updatedAt: this.#now(),
      };
      await this.#put(missing);
      return missing;
    }

    const synced = this.#syncFromMessage<TResult>(
      current,
      message as PeerMessage<unknown, TResult>,
    );
    await this.#put(synced);
    return synced;
  }

  async list(agentId: string): Promise<SpeculativePeerReply[]> {
    const replies: SpeculativePeerReply[] = [];
    for await (
      const entry of this.#store.list<SpeculativePeerReply>(
        speculativePeerReplyPrefix(agentId),
      )
    ) {
      replies.push(entry.value);
    }
    return replies.sort((left, right) => {
      return left.sentAt - right.sentAt || left.id.localeCompare(right.id);
    });
  }

  async consumeReady(agentId: string): Promise<SpeculativePeerReply[]> {
    const replies = await this.list(agentId);
    const ready: SpeculativePeerReply[] = [];

    for (const reply of replies) {
      const synced = await this.sync(reply.peerMessageId);
      if (synced.state === "pending" || synced.consumedAt !== undefined) continue;

      const consumed: SpeculativePeerReply = {
        ...synced,
        consumedAt: this.#now(),
        updatedAt: this.#now(),
      };
      await this.#put(consumed);
      ready.push(consumed);
    }

    return ready;
  }

  #syncFromMessage<TResult>(
    current: SpeculativePeerReply<unknown, TResult>,
    message: PeerMessage<unknown, TResult>,
  ): SpeculativePeerReply<unknown, TResult> {
    if (message.state === "queued" || message.state === "processing") {
      return { ...current, state: "pending", updatedAt: this.#now() };
    }

    if (message.state === "completed") {
      return {
        ...current,
        state: "completed",
        result: message.result,
        comparison: comparePredictionToResult(current.prediction, message.result),
        receivedAt: message.updatedAt,
        updatedAt: this.#now(),
      };
    }

    return {
      ...current,
      state: message.state,
      error: message.error,
      receivedAt: message.updatedAt,
      updatedAt: this.#now(),
    };
  }

  async #recordKeyForPeerMessage(peerMessageId: string): Promise<string> {
    const key = await this.#store.get<string>(
      speculativePeerByMessageKey(peerMessageId),
    );
    if (!key) {
      throw new Error(`Speculative peer index not found: ${peerMessageId}`);
    }
    return key;
  }

  async #put(reply: SpeculativePeerReply): Promise<void> {
    const key = speculativePeerReplyKey(reply.senderAgentId, reply.sentAt, reply.id);
    await this.#store.set(key, reply);
    await this.#store.set(speculativePeerByMessageKey(reply.peerMessageId), key);
  }
}

export function comparePredictionToResult(
  prediction: string | undefined,
  result: unknown,
): PredictionComparison {
  if (!prediction?.trim()) return "unknown";
  const needle = normalizeForComparison(prediction).slice(0, 40);
  if (needle.length < 8) return "unknown";
  const haystack = normalizeForComparison(resultToText(result));
  return haystack.includes(needle) ? "aligned" : "diverged";
}

export function speculativePeerReplyPrefix(agentId: string): string {
  return `agent:${agentId}:speculative-peer:`;
}

export function speculativePeerReplyKey(
  agentId: string,
  sentAt: number,
  replyId: string,
): string {
  return `${speculativePeerReplyPrefix(agentId)}${sentAt}:${replyId}`;
}

export function speculativePeerByMessageKey(peerMessageId: string): string {
  return `peer:message:${peerMessageId}:speculative-reply`;
}

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function resultToText(result: unknown): string {
  if (typeof result === "string") return result;
  if (isRecord(result)) {
    for (const field of ["answer", "output", "summary", "result"]) {
      const value = result[field];
      if (typeof value === "string") return value;
    }
  }
  return JSON.stringify(result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
