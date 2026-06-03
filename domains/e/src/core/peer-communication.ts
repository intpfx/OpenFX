import type { KvStore } from "../interfaces/kv-store.ts";
import type {
  AgentCard,
  CancellationToken,
  EventRecord,
  KernelError,
  PeerEnvelope,
  PeerMessage,
  TurnRecord,
} from "./types.ts";

export interface PeerCommunicationOptions {
  store: KvStore;
  now?: () => number;
  createId?: () => string;
  sleep?: (ms: number) => Promise<void>;
  defaultTtlMs?: number;
  defaultMaxHops?: number;
}

export interface SendPeerMessageInput<TInput = unknown> {
  senderAgentId: string;
  targetAgentId: string;
  body: TInput;
  conversationId?: string;
  responseSchema?: PeerEnvelope<TInput>["responseSchema"];
  ttlMs?: number;
  maxHops?: number;
}

export interface AwaitPeerMessageOptions {
  timeoutMs: number;
  cancellation: CancellationToken;
  pollIntervalMs?: number;
}

export class PeerCommunicationKernel {
  readonly #store: KvStore;
  readonly #now: () => number;
  readonly #createId: () => string;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #defaultTtlMs: number;
  readonly #defaultMaxHops: number;

  constructor(options: PeerCommunicationOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
    this.#sleep = options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#defaultTtlMs = options.defaultTtlMs ?? 300_000;
    this.#defaultMaxHops = options.defaultMaxHops ?? 4;
  }

  async register(
    card: Omit<AgentCard, "updatedAt"> & { updatedAt?: number },
  ): Promise<AgentCard> {
    const nextCard: AgentCard = {
      ...card,
      updatedAt: card.updatedAt ?? this.#now(),
    };
    await this.#store.set(agentCardKey(nextCard.agentId), nextCard);
    return nextCard;
  }

  async list(): Promise<AgentCard[]> {
    const cards: AgentCard[] = [];
    for await (const entry of this.#store.list<AgentCard>(agentCardPrefix())) {
      cards.push(entry.value);
    }
    return cards.sort((a, b) => a.agentId.localeCompare(b.agentId));
  }

  async send<TInput = unknown>(
    input: SendPeerMessageInput<TInput>,
  ): Promise<PeerMessage<TInput>> {
    const envelope: PeerEnvelope<TInput> = {
      id: this.#createId(),
      conversationId: input.conversationId ?? this.#createId(),
      senderAgentId: input.senderAgentId,
      targetAgentId: input.targetAgentId,
      body: input.body,
      responseSchema: input.responseSchema,
      hops: 0,
      maxHops: input.maxHops ?? this.#defaultMaxHops,
      ttlMs: input.ttlMs ?? this.#defaultTtlMs,
      createdAt: this.#now(),
    };

    const message: PeerMessage<TInput> = {
      envelope,
      state: envelope.maxHops <= 0 ? "failed" : "queued",
      error: envelope.maxHops <= 0
        ? {
          code: "peer_max_hops_exceeded",
          message: "Peer message maxHops must be positive.",
        }
        : undefined,
      updatedAt: this.#now(),
    };

    await this.#storeMessage(message);
    return message;
  }

  async get(messageId: string): Promise<PeerMessage | null> {
    const message = await this.#store.get<PeerMessage>(peerMessageKey(messageId));
    if (!message) {
      return null;
    }
    return await this.#expireIfNeeded(message);
  }

  async listInbox(agentId: string): Promise<PeerMessage[]> {
    const messages: PeerMessage[] = [];
    for await (
      const entry of this.#store.list<{ messageId: string }>(peerInboxPrefix(agentId))
    ) {
      const message = await this.get(entry.value.messageId);
      if (message) {
        messages.push(message);
      }
    }
    return messages;
  }

  async markProcessing(messageId: string): Promise<PeerMessage> {
    const message = await this.#requireMessage(messageId);
    if (message.state !== "queued") {
      return message;
    }
    return await this.#storeMessage({
      ...message,
      state: "processing",
      updatedAt: this.#now(),
    });
  }

  async complete<TResult = unknown>(
    messageId: string,
    result: TResult,
  ): Promise<PeerMessage<unknown, TResult>> {
    const message = await this.#requireMessage(messageId);
    const expired = await this.#expireIfNeeded(message);
    if (expired.state === "expired") {
      return expired as PeerMessage<unknown, TResult>;
    }
    return await this.#storeMessage({
      ...expired,
      state: "completed",
      result,
      updatedAt: this.#now(),
    }) as PeerMessage<unknown, TResult>;
  }

  async fail(messageId: string, error: KernelError): Promise<PeerMessage> {
    const message = await this.#requireMessage(messageId);
    return await this.#storeMessage({
      ...message,
      state: "failed",
      error,
      updatedAt: this.#now(),
    });
  }

  async cancel(messageId: string, reason: string): Promise<PeerMessage> {
    return await this.fail(messageId, {
      code: "peer_message_cancelled",
      message: reason,
    }).then((message) => this.#storeMessage({ ...message, state: "cancelled" }));
  }

  async awaitMessage(
    messageId: string,
    options: AwaitPeerMessageOptions,
  ): Promise<PeerMessage> {
    const deadline = this.#now() + options.timeoutMs;
    const pollIntervalMs = options.pollIntervalMs ?? 25;

    while (this.#now() <= deadline) {
      options.cancellation.throwIfCancelled();
      const message = await this.get(messageId);
      if (!message) {
        throw new Error(`Peer message not found: ${messageId}`);
      }
      if (isTerminal(message)) {
        return message;
      }
      await this.#sleep(pollIntervalMs);
    }

    const message = await this.#requireMessage(messageId);
    return await this.fail(message.envelope.id, {
      code: "peer_await_timeout",
      message: `Timed out waiting for peer message: ${messageId}.`,
    });
  }

  async #requireMessage(messageId: string): Promise<PeerMessage> {
    const message = await this.get(messageId);
    if (!message) {
      throw new Error(`Peer message not found: ${messageId}`);
    }
    return message;
  }

  async #expireIfNeeded(message: PeerMessage): Promise<PeerMessage> {
    if (isTerminal(message)) {
      return message;
    }
    if (this.#now() <= message.envelope.createdAt + message.envelope.ttlMs) {
      return message;
    }
    return await this.#storeMessage({
      ...message,
      state: "expired",
      error: {
        code: "peer_message_expired",
        message: `Peer message expired: ${message.envelope.id}.`,
      },
      updatedAt: this.#now(),
    });
  }

  async #storeMessage<TInput, TResult>(
    message: PeerMessage<TInput, TResult>,
  ): Promise<PeerMessage<TInput, TResult>> {
    await this.#store.set(peerMessageKey(message.envelope.id), message);
    await this.#store.set(peerInboxKey(message), {
      messageId: message.envelope.id,
    });
    return message;
  }
}

export function recordPeerEvent(
  record: TurnRecord,
  type: "peer:message_sent" | "peer:message_completed" | "peer:message_expired",
  message: PeerMessage,
  createId: () => string = crypto.randomUUID,
  now: () => number = Date.now,
): TurnRecord {
  const event: EventRecord = {
    id: createId(),
    type,
    at: now(),
    payload: message,
  };
  return { ...record, events: [...record.events, event] };
}

export function agentCardPrefix(): string {
  return "peer:agent-card:";
}

export function agentCardKey(agentId: string): string {
  return `${agentCardPrefix()}${agentId}`;
}

export function peerMessageKey(messageId: string): string {
  return `peer:message:${messageId}`;
}

export function peerInboxPrefix(agentId: string): string {
  return `agent:${agentId}:peer:inbox:`;
}

export function peerInboxKey(message: PeerMessage): string {
  return `${
    peerInboxPrefix(message.envelope.targetAgentId)
  }${message.envelope.createdAt}:${message.envelope.id}`;
}

function isTerminal(message: PeerMessage): boolean {
  return ["completed", "failed", "cancelled", "expired"].includes(message.state);
}
