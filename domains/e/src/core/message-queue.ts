import type { KvStore } from "../interfaces/kv-store.ts";
import type { KernelError, QueuedMessage } from "./types.ts";

export interface MessageQueueOptions {
  store: KvStore;
  now?: () => number;
  createId?: () => string;
}

export class MessageQueue {
  readonly #store: KvStore;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: MessageQueueOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  async enqueue(input: {
    agentId: string;
    sessionId: string;
    content: string;
    priority?: number;
  }): Promise<QueuedMessage> {
    const now = this.#now();
    const message: QueuedMessage = {
      id: this.#createId(),
      agentId: input.agentId,
      sessionId: input.sessionId,
      content: input.content,
      priority: input.priority ?? 0,
      state: "queued",
      createdAt: now,
      updatedAt: now,
    };

    await this.#store.set(queueKey(message), message);
    return message;
  }

  async dequeue(agentId: string, sessionId: string): Promise<QueuedMessage | null> {
    const queued = await this.list(agentId, sessionId, "queued");
    const next =
      queued.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)[0];

    if (!next) {
      return null;
    }

    const processing = {
      ...next,
      state: "processing" as const,
      updatedAt: this.#now(),
    };
    await this.#store.set(queueKey(processing), processing);
    return processing;
  }

  async complete(message: QueuedMessage): Promise<QueuedMessage> {
    const completed = {
      ...message,
      state: "completed" as const,
      updatedAt: this.#now(),
    };
    await this.#store.set(queueKey(completed), completed);
    return completed;
  }

  async fail(message: QueuedMessage, error: KernelError): Promise<QueuedMessage> {
    const failed = {
      ...message,
      state: "failed" as const,
      error,
      updatedAt: this.#now(),
    };
    await this.#store.set(queueKey(failed), failed);
    return failed;
  }

  async list(
    agentId: string,
    sessionId: string,
    state?: QueuedMessage["state"],
  ): Promise<QueuedMessage[]> {
    const messages: QueuedMessage[] = [];
    for await (
      const entry of this.#store.list<QueuedMessage>(queuePrefix(agentId, sessionId))
    ) {
      if (!state || entry.value.state === state) {
        messages.push(entry.value);
      }
    }
    return messages;
  }
}

export function queuePrefix(agentId: string, sessionId: string): string {
  return `agent:${agentId}:queue:${sessionId}:`;
}

export function queueKey(message: QueuedMessage): string {
  return `${
    queuePrefix(message.agentId, message.sessionId)
  }${message.createdAt}:${message.id}`;
}
