import type { DreamNarrative, MemoryEntry } from "./types.ts";

export interface DreamNarrativeOptions {
  now?: () => number;
  createId?: () => string;
}

export class DreamNarrativeKernel {
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: DreamNarrativeOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  draft(agentId: string, memories: MemoryEntry[], limit = 5): DreamNarrative {
    const selected = [...memories]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    const content = selected.length === 0
      ? "No recent memories were available for dream narrative drafting."
      : selected.map((memory) => `- ${memory.content}`).join("\n");
    return {
      id: this.#createId(),
      agentId,
      memoryIds: selected.map((memory) => memory.id),
      content,
      confidence: selected.length === 0 ? 0 : Math.min(1, selected.length / limit),
      createdAt: this.#now(),
    };
  }
}
