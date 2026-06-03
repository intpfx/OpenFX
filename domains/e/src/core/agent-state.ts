import type { KvStore } from "../interfaces/kv-store.ts";
import type {
  AgentState,
  CerebellumInsight,
  HeartbeatSchedule,
  MemoryEntry,
  ObservationEvent,
  PersonaProfile,
  TurnRecord,
  WorldViewProfile,
  WorldViewStatement,
} from "./types.ts";

export interface AgentStateKernelOptions {
  store: KvStore;
  now?: () => number;
  createId?: () => string;
}

export interface SystemPromptSection {
  content: string;
  personaDigest: string;
}

export class AgentStateKernel {
  readonly #store: KvStore;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: AgentStateKernelOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  async getState(agentId: string): Promise<AgentState> {
    const existing = await this.#store.get<AgentState>(agentStateKey(agentId));
    if (existing) {
      if (!existing.worldview) {
        const migrated = {
          ...existing,
          worldview: this.#defaultWorldView(agentId),
          updatedAt: this.#now(),
        };
        await this.#saveState(migrated);
        return migrated;
      }
      return existing;
    }

    const state: AgentState = {
      agentId,
      persona: await this.#defaultPersona(agentId),
      worldview: this.#defaultWorldView(agentId),
      memories: [],
      observations: [],
      heartbeatSchedules: [],
      cerebellumInsights: [],
      updatedAt: this.#now(),
    };
    await this.#saveState(state);
    return state;
  }

  async setPersona(agentId: string, persona: PersonaProfile): Promise<PersonaProfile> {
    const state = await this.getState(agentId);
    const nextState = { ...state, persona, updatedAt: this.#now() };
    await this.#saveState(nextState);
    return persona;
  }

  async buildSystemPromptSection(agentId: string): Promise<SystemPromptSection> {
    const state = await this.getState(agentId);
    const content = [
      `Agent: ${state.persona.displayName}`,
      state.persona.systemPrompt,
      `Cannot pretend to be: ${state.persona.cannotPretendToBe.join(", ") || "none"}`,
      `Clarify when: ${state.persona.clarifyWhen.join(", ") || "unclear"}`,
      formatWorldView(state.worldview),
    ].join("\n");

    return { content, personaDigest: state.persona.digest };
  }

  async retainMemory(
    agentId: string,
    content: string,
    source: string,
    options: Partial<Pick<MemoryEntry, "kind" | "salience">> = {},
  ): Promise<MemoryEntry> {
    const memory: MemoryEntry = {
      id: this.#createId(),
      agentId,
      kind: options.kind ?? "fact",
      content,
      source,
      salience: options.salience ?? 5,
      createdAt: this.#now(),
    };

    await this.#store.set(memoryKey(memory), memory);
    const state = await this.getState(agentId);
    await this.#saveState({
      ...state,
      memories: upsertById(state.memories, memory),
      updatedAt: this.#now(),
    });
    return memory;
  }

  async recallMemories(
    agentId: string,
    query: string,
    budget: number,
  ): Promise<MemoryEntry[]> {
    const state = await this.getState(agentId);
    const normalizedQuery = query.toLowerCase();
    return state.memories
      .filter((memory) =>
        memory.content.toLowerCase().includes(normalizedQuery) ||
        memory.kind.toLowerCase().includes(normalizedQuery)
      )
      .sort((a, b) => b.salience - a.salience || b.createdAt - a.createdAt)
      .slice(0, budget);
  }

  async updateWorldView(
    agentId: string,
    input: Omit<WorldViewStatement, "id" | "agentId" | "updatedAt"> & {
      id?: string;
    },
  ): Promise<WorldViewStatement> {
    const statement: WorldViewStatement = {
      id: input.id ?? this.#createId(),
      agentId,
      kind: input.kind,
      content: input.content,
      confidence: clampConfidence(input.confidence),
      source: input.source,
      updatedAt: this.#now(),
    };

    await this.#store.set(worldViewStatementKey(statement), statement);
    const state = await this.getState(agentId);
    const worldview: WorldViewProfile = {
      agentId,
      statements: upsertById(state.worldview.statements, statement)
        .sort((a, b) => b.confidence - a.confidence || b.updatedAt - a.updatedAt),
      updatedAt: this.#now(),
    };
    await this.#saveState({ ...state, worldview, updatedAt: this.#now() });
    return statement;
  }

  async recallWorldView(
    agentId: string,
    query: string,
    budget: number,
  ): Promise<WorldViewStatement[]> {
    const state = await this.getState(agentId);
    const normalizedQuery = query.toLowerCase();
    return state.worldview.statements
      .filter((statement) =>
        statement.content.toLowerCase().includes(normalizedQuery) ||
        statement.kind.toLowerCase().includes(normalizedQuery)
      )
      .sort((a, b) => b.confidence - a.confidence || b.updatedAt - a.updatedAt)
      .slice(0, budget);
  }

  async captureTurnMemory(record: TurnRecord): Promise<MemoryEntry | null> {
    if (!record.decision || record.finalState === "cancelled") {
      return null;
    }

    const summary =
      `Turn ${record.id} ended as ${record.finalState} with ${record.decision.kind}.`;
    return await this.retainMemory(record.agentId, summary, `turn:${record.id}`, {
      kind: "hindsight",
      salience: record.finalState === "blocked" ? 8 : 4,
    });
  }

  async compactSessionToMentalModel(
    agentId: string,
    sessionId: string,
  ): Promise<MemoryEntry> {
    const prefix = `agent:${agentId}:session:${sessionId}:message:`;
    const messages: string[] = [];
    for await (const entry of this.#store.list(prefix, { limit: 20 })) {
      messages.push(JSON.stringify(entry.value));
    }

    return await this.retainMemory(
      agentId,
      messages.join("\n").slice(0, 2000),
      `session:${sessionId}`,
      { kind: "summary", salience: 6 },
    );
  }

  async prefetchCerebellumContext(
    agentId: string,
    turnInput: string,
    budget: number,
  ): Promise<CerebellumInsight[]> {
    const state = await this.getState(agentId);
    const query = turnInput.toLowerCase();
    return state.cerebellumInsights
      .filter((insight) =>
        insight.content.toLowerCase().includes(query) || insight.late
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, budget);
  }

  async attachCerebellumInsight(
    agentId: string,
    turnId: string,
    content: string,
  ): Promise<CerebellumInsight> {
    return await this.#recordInsight(agentId, content, false, turnId);
  }

  async recordLateInsight(
    agentId: string,
    content: string,
  ): Promise<CerebellumInsight> {
    return await this.#recordInsight(agentId, content, true);
  }

  async scheduleBackgroundCognition(
    agentId: string,
    reason: string,
  ): Promise<HeartbeatSchedule> {
    return await this.scheduleWakeup(
      agentId,
      `background:${reason}`,
      this.#now() + 60_000,
    );
  }

  async scheduleWakeup(
    agentId: string,
    reason: string,
    nextAt: number,
    intervalMs?: number,
  ): Promise<HeartbeatSchedule> {
    const heartbeat: HeartbeatSchedule = {
      id: this.#createId(),
      agentId,
      reason,
      nextAt,
      intervalMs,
    };

    await this.#store.set(heartbeatKey(heartbeat), heartbeat);
    const state = await this.getState(agentId);
    await this.#saveState({
      ...state,
      heartbeatSchedules: upsertById(state.heartbeatSchedules, heartbeat),
      updatedAt: this.#now(),
    });
    return heartbeat;
  }

  async observe(
    agentId: string,
    type: string,
    payload?: unknown,
  ): Promise<ObservationEvent> {
    const event: ObservationEvent = {
      id: this.#createId(),
      agentId,
      type,
      payload,
      observedAt: this.#now(),
    };

    const state = await this.getState(agentId);
    await this.#saveState({
      ...state,
      observations: upsertById(state.observations, event),
      updatedAt: this.#now(),
    });
    return event;
  }

  async #recordInsight(
    agentId: string,
    content: string,
    late: boolean,
    turnId?: string,
  ): Promise<CerebellumInsight> {
    const insight: CerebellumInsight = {
      id: this.#createId(),
      agentId,
      turnId,
      content,
      createdAt: this.#now(),
      late,
    };

    const state = await this.getState(agentId);
    await this.#saveState({
      ...state,
      cerebellumInsights: upsertById(state.cerebellumInsights, insight),
      updatedAt: this.#now(),
    });
    return insight;
  }

  async #defaultPersona(agentId: string): Promise<PersonaProfile> {
    const systemPrompt =
      "You are an e agent. Be precise, helpful, and explicit about uncertainty.";
    return {
      agentId,
      displayName: "e",
      systemPrompt,
      cannotPretendToBe: ["human", "external service"],
      clarifyWhen: ["requirements conflict", "approval is required"],
      digest: await digestText(systemPrompt),
    };
  }

  #defaultWorldView(agentId: string): WorldViewProfile {
    return {
      agentId,
      statements: [],
      updatedAt: this.#now(),
    };
  }

  async #saveState(state: AgentState): Promise<void> {
    await this.#store.set(agentStateKey(state.agentId), state);
  }
}

export function agentStateKey(agentId: string): string {
  return `agent:${agentId}:state`;
}

export function memoryKey(memory: MemoryEntry): string {
  return `agent:${memory.agentId}:memory:${memory.kind}:${memory.salience}:${memory.id}`;
}

export function heartbeatKey(heartbeat: HeartbeatSchedule): string {
  return `agent:${heartbeat.agentId}:heartbeat:${heartbeat.nextAt}:${heartbeat.id}`;
}

export function worldViewStatementKey(statement: WorldViewStatement): string {
  return `agent:${statement.agentId}:worldview:${statement.kind}:${statement.confidence}:${statement.id}`;
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  return [...items.filter((candidate) => candidate.id !== item.id), item];
}

function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) {
    return 0;
  }
  return Math.max(0, Math.min(1, confidence));
}

function formatWorldView(worldview: WorldViewProfile): string {
  if (worldview.statements.length === 0) {
    return "WorldView: none";
  }

  const statements = worldview.statements
    .slice(0, 5)
    .map((statement) =>
      `- ${statement.kind} (${statement.confidence.toFixed(2)}): ${statement.content}`
    )
    .join("\n");
  return `WorldView:\n${statements}`;
}

async function digestText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
