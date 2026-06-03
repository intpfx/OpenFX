import type { KvStore } from "../interfaces/kv-store.ts";
import type { SessionMessage, SessionMessageRole } from "./types.ts";

export interface SessionManagerOptions {
  store: KvStore;
  now?: () => number;
  createId?: () => string;
}

export class SessionManager {
  readonly #store: KvStore;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: SessionManagerOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  async appendMessage(input: {
    agentId: string;
    sessionId: string;
    role: SessionMessageRole;
    content: string;
    turnId?: string;
  }): Promise<SessionMessage> {
    const message: SessionMessage = {
      id: this.#createId(),
      agentId: input.agentId,
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      turnId: input.turnId,
      createdAt: this.#now(),
    };

    await this.#store.set(sessionMessageKey(message), message);
    return message;
  }

  async listMessages(
    agentId: string,
    sessionId: string,
    options: { limit?: number; reverse?: boolean } = {},
  ): Promise<SessionMessage[]> {
    const messages: SessionMessage[] = [];
    for await (
      const entry of this.#store.list<SessionMessage>(
        sessionMessagePrefix(agentId, sessionId),
        options,
      )
    ) {
      messages.push(entry.value);
    }
    return messages;
  }

  async replaySession(agentId: string, sessionId: string): Promise<SessionMessage[]> {
    return await this.listMessages(agentId, sessionId);
  }
}

export function sessionMessagePrefix(agentId: string, sessionId: string): string {
  return `agent:${agentId}:session:${sessionId}:message:`;
}

export function sessionMessageKey(message: SessionMessage): string {
  return `${
    sessionMessagePrefix(message.agentId, message.sessionId)
  }${message.createdAt}:${message.id}`;
}
