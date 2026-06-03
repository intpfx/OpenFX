import { AgentStateKernel } from "../core/agent-state.ts";
import { EventEngine } from "../core/event-engine.ts";
import { EvolutionKernel } from "../core/evolution.ts";
import { MessageQueue } from "../core/message-queue.ts";
import type { ModelRuntime } from "../core/model-runtime.ts";
import { PeerCommunicationKernel } from "../core/peer-communication.ts";
import { runAgentTurn, type RunAgentTurnResult } from "../core/agent-loop.ts";
import { SessionManager } from "../core/session-manager.ts";
import { SubagentTaskKernel } from "../core/subagent-task.ts";
import type { ToolDefinition } from "../core/tool-runner.ts";
import type {
  AgentCard,
  QueuedMessage,
  ToolExecutionRecord,
  WorkspaceResource,
} from "../core/types.ts";
import { WorkspaceResources } from "../core/workspace-resources.ts";
import type { KvStore } from "../interfaces/kv-store.ts";

export interface EAgentRuntimeOptions {
  agentId: string;
  sessionId: string;
  store: KvStore;
  model: ModelRuntime;
  workspaceResources: WorkspaceResources;
  tools?: ToolDefinition[];
  eventEngine?: EventEngine;
  agentCard?: Omit<AgentCard, "agentId" | "updatedAt" | "queueDepth">;
  now?: () => number;
  createId?: () => string;
}

export interface EAgentRuntimeStep {
  queuedMessage: QueuedMessage;
  turn: RunAgentTurnResult;
  followUpQueued?: QueuedMessage;
}

export class EAgentRuntime {
  readonly agentId: string;
  readonly sessionId: string;
  readonly queue: MessageQueue;
  readonly sessionManager: SessionManager;
  readonly agentState: AgentStateKernel;
  readonly peers: PeerCommunicationKernel;
  readonly subagents: SubagentTaskKernel;
  readonly evolution: EvolutionKernel;
  readonly #store: KvStore;
  readonly #model: ModelRuntime;
  readonly #workspaceResources: WorkspaceResources;
  readonly #tools: ToolDefinition[];
  readonly #eventEngine?: EventEngine;
  readonly #agentCard?: Omit<AgentCard, "agentId" | "updatedAt" | "queueDepth">;
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: EAgentRuntimeOptions) {
    this.agentId = options.agentId;
    this.sessionId = options.sessionId;
    this.#store = options.store;
    this.#model = options.model;
    this.#workspaceResources = options.workspaceResources;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
    this.#eventEngine = options.eventEngine;
    this.#agentCard = options.agentCard;
    this.queue = new MessageQueue({
      store: options.store,
      now: this.#now,
      createId: this.#createId,
    });
    this.sessionManager = new SessionManager({
      store: options.store,
      now: this.#now,
      createId: this.#createId,
    });
    this.agentState = new AgentStateKernel({
      store: options.store,
      now: this.#now,
      createId: this.#createId,
    });
    this.peers = new PeerCommunicationKernel({
      store: options.store,
      now: this.#now,
      createId: this.#createId,
    });
    this.subagents = new SubagentTaskKernel({
      store: options.store,
      now: this.#now,
      createId: this.#createId,
    });
    this.evolution = new EvolutionKernel({
      store: options.store,
      now: this.#now,
      createId: this.#createId,
    });
    this.#tools = [
      createReadResourceTool(this.#workspaceResources),
      ...(options.tools ?? []),
    ];
  }

  async registerSelf(): Promise<AgentCard> {
    const queued = await this.queue.list(this.agentId, this.sessionId, "queued");
    return await this.peers.register({
      agentId: this.agentId,
      displayName: this.#agentCard?.displayName ?? this.agentId,
      purpose: this.#agentCard?.purpose ?? "e reference runtime agent",
      model: this.#agentCard?.model,
      capabilities: this.#agentCard?.capabilities ?? ["agent-loop", "tools"],
      status: this.#agentCard?.status ?? "idle",
      queueDepth: queued.length,
    });
  }

  async enqueueUserMessage(content: string, priority = 0): Promise<QueuedMessage> {
    return await this.queue.enqueue({
      agentId: this.agentId,
      sessionId: this.sessionId,
      content,
      priority,
    });
  }

  async processNext(): Promise<EAgentRuntimeStep | null> {
    const queuedMessage = await this.queue.dequeue(this.agentId, this.sessionId);
    if (!queuedMessage) {
      return null;
    }

    const turn = await runAgentTurn({
      agentId: this.agentId,
      sessionId: this.sessionId,
      userMessage: queuedMessage.content,
      model: this.#model,
      store: this.#store,
      agentState: this.agentState,
      eventEngine: this.#eventEngine,
      sessionManager: this.sessionManager,
      tools: this.#tools,
      now: this.#now,
      createId: this.#createId,
    });

    if (turn.state === "blocked") {
      await this.queue.fail(
        queuedMessage,
        turn.record.error ?? {
          code: "turn_blocked",
          message: "Turn blocked without a specific error.",
        },
      );
      return { queuedMessage, turn };
    }

    await this.queue.complete(queuedMessage);
    const followUpQueued = await this.#enqueueToolFollowUp(turn.record.toolExecutions);
    return { queuedMessage, turn, followUpQueued };
  }

  async runUntilIdle(limit = 8): Promise<EAgentRuntimeStep[]> {
    const steps: EAgentRuntimeStep[] = [];

    for (let index = 0; index < limit; index++) {
      const step = await this.processNext();
      if (!step) {
        return steps;
      }
      steps.push(step);
    }

    throw new Error(`EAgentRuntime did not become idle within ${limit} steps.`);
  }

  async #enqueueToolFollowUp(
    toolExecutions: ToolExecutionRecord[],
  ): Promise<QueuedMessage | undefined> {
    const successfulTool = toolExecutions.find((execution) =>
      execution.state === "succeeded"
    );
    if (!successfulTool) {
      return undefined;
    }

    await this.sessionManager.appendMessage({
      agentId: this.agentId,
      sessionId: this.sessionId,
      role: "tool",
      content: JSON.stringify(successfulTool.result),
    });

    return await this.queue.enqueue({
      agentId: this.agentId,
      sessionId: this.sessionId,
      content: `Tool result from ${successfulTool.toolName}: ${
        JSON.stringify(successfulTool.result)
      }\nContinue and produce a final AgentDecision.`,
      priority: 100,
    });
  }
}

export function createReadResourceTool(
  workspaceResources: WorkspaceResources,
): ToolDefinition {
  return {
    name: "read_resource",
    validateArgs(args) {
      if (!isRecord(args) || typeof args.uri !== "string") {
        return {
          ok: false,
          error: {
            code: "invalid_tool_args",
            message: "read_resource.uri must be a string.",
          },
        };
      }

      if (args.anchorText !== undefined && typeof args.anchorText !== "string") {
        return {
          ok: false,
          error: {
            code: "invalid_tool_args",
            message: "read_resource.anchorText must be a string when provided.",
          },
        };
      }

      return { ok: true, args };
    },
    async run(args): Promise<WorkspaceResource> {
      if (!isRecord(args) || typeof args.uri !== "string") {
        throw new Error("Invalid read_resource args after validation.");
      }

      return await workspaceResources.resolve(args.uri, {
        anchorText: typeof args.anchorText === "string" ? args.anchorText : undefined,
      });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
