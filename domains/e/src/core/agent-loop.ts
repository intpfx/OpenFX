import type { KvStore } from "../interfaces/kv-store.ts";
import type { AgentPolicy } from "./agent-policy.ts";
import type { AgentStateKernel } from "./agent-state.ts";
import type { EventEngine } from "./event-engine.ts";
import type { ModelMessage, ModelRuntime } from "./model-runtime.ts";
import { SafetyActionGate } from "./safety-action-gate.ts";
import { SessionManager } from "./session-manager.ts";
import { type ToolDefinition, ToolRunner } from "./tool-runner.ts";
import type {
  AgentDecision,
  BoundaryRequest,
  CancellationToken,
  EventRecord,
  KernelError,
  ProposedAction,
  TurnRecord,
  TurnState,
} from "./types.ts";

export interface RunAgentTurnInput {
  agentId: string;
  sessionId: string;
  taskId?: string | null;
  inputMessageIds?: string[];
  userMessage: string;
  model: ModelRuntime;
  store: KvStore;
  agentState?: AgentStateKernel;
  eventEngine?: EventEngine;
  agentPolicy?: AgentPolicy;
  sessionManager?: SessionManager;
  tools?: ToolDefinition[];
  now?: () => number;
  createId?: () => string;
  cancellationToken?: CancellationToken;
}

export interface RunAgentTurnResult {
  state: TurnState;
  decision?: AgentDecision;
  record: TurnRecord;
}

const MAX_REPAIR_ATTEMPTS = 1;

export async function runAgentTurn(
  input: RunAgentTurnInput,
): Promise<RunAgentTurnResult> {
  const now = input.now ?? Date.now;
  const createId = input.createId ?? crypto.randomUUID;
  const startedAt = now();
  const turnId = createId();
  const events: EventRecord[] = [];

  const record: TurnRecord = {
    id: turnId,
    agentId: input.agentId,
    sessionId: input.sessionId,
    taskId: input.taskId ?? null,
    startedAt,
    inputMessageIds: input.inputMessageIds ?? [],
    promptDigest: await digestText(input.userMessage),
    events,
    eventEngineRecords: [],
    toolExecutions: [],
    boundaryRequests: [],
    proposedActions: [],
    appliedActions: [],
    modelRoutes: [],
    finalState: "queued",
  };

  const pushEvent = (type: string, payload?: unknown) => {
    events.push({ id: createId(), type, at: now(), payload });
  };

  try {
    input.cancellationToken?.throwIfCancelled();
    pushEvent("turn:started");
    await input.agentState?.observe(input.agentId, "turn:started", { turnId });
    const sessionManager = input.sessionManager ??
      new SessionManager({ store: input.store, now, createId });
    await sessionManager.appendMessage({
      agentId: input.agentId,
      sessionId: input.sessionId,
      role: "user",
      content: input.userMessage,
      turnId,
    });
    setState(record, "calling_model", pushEvent);

    const stateContext = input.agentState
      ? await buildStateContext(input.agentState, input.agentId, input.userMessage)
      : null;
    const messages: ModelMessage[] = [
      {
        role: "system",
        content: [
          "Return exactly one JSON AgentDecision.",
          stateContext?.systemPrompt.content,
          stateContext?.memories.length
            ? `Relevant memories:\n${
              stateContext.memories.map((memory) => `- ${memory.content}`).join("\n")
            }`
            : undefined,
          stateContext?.insights.length
            ? `Cerebellum insights:\n${
              stateContext.insights.map((insight) => `- ${insight.content}`).join("\n")
            }`
            : undefined,
        ].filter(Boolean).join("\n\n"),
      },
      { role: "user", content: input.userMessage },
    ];

    if (input.eventEngine) {
      const eventResult = await input.eventEngine.emit("model:before_call", messages);
      record.eventEngineRecords.push(...eventResult.records);

      if (eventResult.blocked) {
        return await finishBlocked(record, input.store, now, {
          code: "event_blocked",
          message: eventResult.blockReason ?? "Event handler blocked model call.",
        }, pushEvent);
      }

      messages.splice(0, messages.length, ...eventResult.payload as ModelMessage[]);
      for (const injectedMessage of eventResult.injectedMessages) {
        messages.push({ role: "system", content: injectedMessage });
      }
    }

    let response = await input.model.complete({ role: "default", messages });
    record.modelRoutes.push(response.route);

    let parsed = parseAgentDecision(response.content);
    for (
      let repairCount = 0;
      !parsed.ok && repairCount < MAX_REPAIR_ATTEMPTS;
      repairCount++
    ) {
      pushEvent("decision:repair_requested", parsed.error);
      response = await input.model.complete({
        role: "smol",
        messages,
        repairOf: response.content,
      });
      record.modelRoutes.push(response.route);
      parsed = parseAgentDecision(response.content);
    }

    if (!parsed.ok) {
      await input.agentState?.observe(
        input.agentId,
        "decision:repair_failed",
        parsed.error,
      );
      return await finishBlocked(record, input.store, now, {
        code: "invalid_agent_decision",
        message: parsed.error,
      }, pushEvent);
    }

    setState(record, "routing_decision", pushEvent);
    record.decision = parsed.decision;
    pushEvent("decision:accepted", parsed.decision.kind);
    await input.agentState?.observe(
      input.agentId,
      "decision:accepted",
      parsed.decision.kind,
    );

    if (input.eventEngine) {
      const eventResult = await input.eventEngine.emit(
        "decision:accepted",
        parsed.decision,
      );
      record.eventEngineRecords.push(...eventResult.records);

      if (eventResult.blocked) {
        return await finishBlocked(record, input.store, now, {
          code: "event_blocked",
          message: eventResult.blockReason ?? "Event handler blocked decision.",
        }, pushEvent);
      }

      if (eventResult.overrideDecision) {
        record.decision = eventResult.overrideDecision;
        pushEvent("decision:overridden", eventResult.overrideDecision.kind);
      }
    }

    await routeDecision(record, record.decision, {
      createId,
      now,
      pushEvent,
      agentPolicy: input.agentPolicy,
      tools: input.tools ?? [],
    });

    record.endedAt = now();
    if (record.decision?.kind === "complete") {
      await sessionManager.appendMessage({
        agentId: input.agentId,
        sessionId: input.sessionId,
        role: "assistant",
        content: record.decision.result,
        turnId,
      });
    }
    await input.agentState?.captureTurnMemory(record);
    await input.agentState?.observe(input.agentId, "turn:ended", {
      turnId,
      finalState: record.finalState,
    });
    await persistTurnRecord(input.store, record);
    return { state: record.finalState, decision: record.decision, record };
  } catch (error) {
    const kernelError = toKernelError(error);
    if (kernelError.code === "cancelled") {
      setState(record, "cancelled", pushEvent);
    } else {
      record.error = kernelError;
      setState(record, "blocked", pushEvent);
    }

    record.endedAt = now();
    await input.agentState?.captureTurnMemory(record);
    await input.agentState?.observe(input.agentId, "turn:ended", {
      turnId,
      finalState: record.finalState,
    });
    await persistTurnRecord(input.store, record);
    return { state: record.finalState, decision: record.decision, record };
  }
}

async function buildStateContext(
  agentState: AgentStateKernel,
  agentId: string,
  userMessage: string,
) {
  const [systemPrompt, memories, insights] = await Promise.all([
    agentState.buildSystemPromptSection(agentId),
    agentState.recallMemories(agentId, userMessage, 5),
    agentState.prefetchCerebellumContext(agentId, userMessage, 3),
  ]);

  return { systemPrompt, memories, insights };
}

function routeDecision(
  record: TurnRecord,
  decision: AgentDecision,
  context: {
    createId: () => string;
    now: () => number;
    pushEvent: (type: string, payload?: unknown) => void;
    agentPolicy?: AgentPolicy;
    tools: ToolDefinition[];
  },
): Promise<void> | void {
  const { createId, now, pushEvent } = context;

  switch (decision.kind) {
    case "think":
      setState(record, "completed", pushEvent);
      return;
    case "complete":
      setState(record, "completed", pushEvent);
      return;
    case "ask_orchestrator":
      setState(record, "waiting_boundary", pushEvent);
      return;
    case "request_boundary": {
      const request = createBoundaryRequest(
        decision.reason,
        decision.action,
        now,
        createId,
      );
      record.proposedActions.push(request.action);
      record.boundaryRequests.push(request);
      setState(record, "waiting_boundary", pushEvent);
      return;
    }
    case "call_tool":
      if (context.agentPolicy) {
        const policyResult = context.agentPolicy.evaluateDecision(decision);
        if (policyResult.blocked) {
          record.error = policyResult.blocked;
          setState(record, "blocked", pushEvent);
          return;
        }
        if (policyResult.overrideDecision) {
          record.decision = policyResult.overrideDecision;
          pushEvent("decision:policy_overridden", policyResult.overrideDecision.kind);
          return routeDecision(record, policyResult.overrideDecision, context);
        }
      }
      return routeToolCall(record, decision, context);
  }
}

async function routeToolCall(
  record: TurnRecord,
  decision: Extract<AgentDecision, { kind: "call_tool" }>,
  context: {
    createId: () => string;
    now: () => number;
    pushEvent: (type: string, payload?: unknown) => void;
    agentPolicy?: AgentPolicy;
    tools: ToolDefinition[];
  },
): Promise<void> {
  setState(record, "calling_tool", context.pushEvent);

  const safetyGate = new SafetyActionGate({
    now: context.now,
    createId: context.createId,
  });
  const toolRunner = new ToolRunner(context.tools, {
    now: context.now,
    createId: context.createId,
    safetyGate,
  });

  const result = await toolRunner.run(decision);
  record.toolExecutions.push(result.execution);

  if (result.proposedAction) {
    record.proposedActions.push(result.proposedAction);
  }

  if (result.boundaryRequest) {
    record.boundaryRequests.push(result.boundaryRequest);
    setState(record, "waiting_boundary", context.pushEvent);
    return;
  }

  if (result.blocked) {
    record.error = result.execution.error;
    setState(record, "blocked", context.pushEvent);
    return;
  }

  setState(record, "completed", context.pushEvent);
}

function createBoundaryRequest(
  reason: string,
  action: ProposedAction,
  now: () => number,
  createId: () => string,
): BoundaryRequest {
  const safetyGate = new SafetyActionGate({ now, createId });
  return safetyGate.createBoundaryRequest(reason, action);
}

function setState(
  record: TurnRecord,
  state: TurnState,
  pushEvent: (type: string, payload?: unknown) => void,
) {
  record.finalState = state;
  pushEvent("turn:state_changed", state);
}

async function finishBlocked(
  record: TurnRecord,
  store: KvStore,
  now: () => number,
  error: KernelError,
  pushEvent: (type: string, payload?: unknown) => void,
): Promise<RunAgentTurnResult> {
  record.error = error;
  setState(record, "blocked", pushEvent);
  record.endedAt = now();
  await persistTurnRecord(store, record);
  return { state: record.finalState, decision: record.decision, record };
}

function parseAgentDecision(content: string): { ok: true; decision: AgentDecision } | {
  ok: false;
  error: string;
} {
  try {
    return validateAgentDecision(JSON.parse(content));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON.",
    };
  }
}

export function validateAgentDecision(value: unknown): {
  ok: true;
  decision: AgentDecision;
} | { ok: false; error: string } {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return { ok: false, error: "AgentDecision must be an object with kind." };
  }

  switch (value.kind) {
    case "think":
      return typeof value.summary === "string"
        ? { ok: true, decision: { kind: "think", summary: value.summary } }
        : { ok: false, error: "think.summary must be a string." };
    case "complete":
      return typeof value.result === "string"
        ? { ok: true, decision: { kind: "complete", result: value.result } }
        : { ok: false, error: "complete.result must be a string." };
    case "ask_orchestrator":
      return typeof value.question === "string"
        ? { ok: true, decision: { kind: "ask_orchestrator", question: value.question } }
        : { ok: false, error: "ask_orchestrator.question must be a string." };
    case "call_tool":
      return typeof value.toolName === "string"
        ? {
          ok: true,
          decision: { kind: "call_tool", toolName: value.toolName, args: value.args },
        }
        : { ok: false, error: "call_tool.toolName must be a string." };
    case "request_boundary":
      if (typeof value.reason !== "string") {
        return { ok: false, error: "request_boundary.reason must be a string." };
      }

      if (!isProposedAction(value.action)) {
        return {
          ok: false,
          error: "request_boundary.action must be a ProposedAction.",
        };
      }

      return {
        ok: true,
        decision: {
          kind: "request_boundary",
          reason: value.reason,
          action: value.action,
        },
      };
    default:
      return { ok: false, error: `Unsupported AgentDecision kind: ${value.kind}` };
  }
}

export async function persistTurnRecord(
  store: KvStore,
  record: TurnRecord,
): Promise<void> {
  await store.set(turnRecordKey(record.agentId, record.id), record);
}

export function turnRecordKey(agentId: string, turnId: string): string {
  return `agent:${agentId}:turn:${turnId}`;
}

async function digestText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProposedAction(value: unknown): value is ProposedAction {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string" &&
    ["file_edit", "external_effect", "workspace_change"].includes(String(value.kind)) &&
    typeof value.title === "string" &&
    typeof value.target === "string" &&
    ["draft", "ready", "approved", "applied", "rejected", "stale"].includes(
      String(value.state),
    );
}

function toKernelError(error: unknown): KernelError {
  if (error instanceof Error && error.message === "cancelled") {
    return { code: "cancelled", message: error.message };
  }

  return {
    code: "turn_failed",
    message: error instanceof Error ? error.message : String(error),
  };
}
