import type { KvStore } from "../interfaces/kv-store.ts";
import type { Channel, ChannelMessage } from "./types.ts";

export interface ChannelKernelOptions {
  store: KvStore;
  now?: () => number;
  createId?: () => string;
}

export class ChannelKernel {
  readonly #store: KvStore;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: ChannelKernelOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  async create(input: {
    name: string;
    memberAgentIds: string[];
    moderatorAgentId?: string;
  }): Promise<Channel> {
    const channel: Channel = {
      id: this.#createId(),
      name: input.name,
      memberAgentIds: [...new Set(input.memberAgentIds)],
      moderatorAgentId: input.moderatorAgentId,
      nextSpeakerIndex: 0,
      createdAt: this.#now(),
      updatedAt: this.#now(),
    };
    await this.#storeChannel(channel);
    return channel;
  }

  async get(channelId: string): Promise<Channel | null> {
    return await this.#store.get<Channel>(channelKey(channelId));
  }

  async addMember(channelId: string, agentId: string): Promise<Channel> {
    const channel = await this.#requireChannel(channelId);
    const memberAgentIds = [...new Set([...channel.memberAgentIds, agentId])];
    return await this.#storeChannel({
      ...channel,
      memberAgentIds,
      updatedAt: this.#now(),
    });
  }

  async appendMessage(
    channelId: string,
    agentId: string,
    content: string,
  ): Promise<ChannelMessage> {
    const channel = await this.#requireChannel(channelId);
    if (!channel.memberAgentIds.includes(agentId)) {
      throw new Error(`Agent is not a channel member: ${agentId}`);
    }

    const message: ChannelMessage = {
      id: this.#createId(),
      channelId,
      agentId,
      content,
      createdAt: this.#now(),
    };
    await this.#store.set(channelMessageKey(message), message);
    await this.advanceSpeaker(channelId);
    return message;
  }

  async listMessages(channelId: string): Promise<ChannelMessage[]> {
    const messages: ChannelMessage[] = [];
    for await (
      const entry of this.#store.list<ChannelMessage>(channelMessagePrefix(channelId))
    ) {
      messages.push(entry.value);
    }
    return messages;
  }

  async nextSpeaker(channelId: string): Promise<string | null> {
    const channel = await this.#requireChannel(channelId);
    return channel.memberAgentIds[channel.nextSpeakerIndex] ?? null;
  }

  async advanceSpeaker(channelId: string): Promise<Channel> {
    const channel = await this.#requireChannel(channelId);
    const size = channel.memberAgentIds.length;
    return await this.#storeChannel({
      ...channel,
      nextSpeakerIndex: size === 0 ? 0 : (channel.nextSpeakerIndex + 1) % size,
      updatedAt: this.#now(),
    });
  }

  async #requireChannel(channelId: string): Promise<Channel> {
    const channel = await this.get(channelId);
    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`);
    }
    return channel;
  }

  async #storeChannel(channel: Channel): Promise<Channel> {
    await this.#store.set(channelKey(channel.id), channel);
    return channel;
  }
}

export function channelKey(channelId: string): string {
  return `channel:${channelId}`;
}

export function channelMessagePrefix(channelId: string): string {
  return `channel:${channelId}:message:`;
}

export function channelMessageKey(message: ChannelMessage): string {
  return `${channelMessagePrefix(message.channelId)}${message.createdAt}:${message.id}`;
}
