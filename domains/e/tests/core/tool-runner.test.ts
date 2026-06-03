import { assertEquals, assertExists } from "jsr:@std/assert";

import {
  InMemoryKvStore,
  runAgentTurn,
  SafetyActionGate,
  StaticModelRuntime,
  type ToolDefinition,
} from "../../src/mod.ts";

Deno.test("safe tool call validates args, runs, and completes the turn", async () => {
  const store = new InMemoryKvStore();
  const model = new StaticModelRuntime([
    { kind: "call_tool", toolName: "echo", args: { text: "hello" } },
  ]);

  const result = await runAgentTurn({
    agentId: "agent-1",
    sessionId: "session-1",
    userMessage: "echo",
    model,
    store,
    tools: [echoTool()],
    createId: fixedIds("turn-1"),
    now: fixedNow(1000),
  });

  assertEquals(result.state, "completed");
  assertEquals(result.record.toolExecutions[0].state, "succeeded");
  assertEquals(result.record.toolExecutions[0].result, { text: "hello" });
});

Deno.test("unregistered tool cannot execute and blocks the turn", async () => {
  const store = new InMemoryKvStore();
  const model = new StaticModelRuntime([
    { kind: "call_tool", toolName: "missing", args: {} },
  ]);

  const result = await runAgentTurn({
    agentId: "agent-1",
    sessionId: "session-1",
    userMessage: "missing",
    model,
    store,
    tools: [],
    createId: fixedIds("turn-2"),
    now: fixedNow(2000),
  });

  assertEquals(result.state, "blocked");
  assertEquals(result.record.error?.code, "tool_not_authorized");
  assertEquals(result.record.toolExecutions[0].state, "failed");
});

Deno.test("invalid tool args block before execution", async () => {
  const store = new InMemoryKvStore();
  const model = new StaticModelRuntime([
    { kind: "call_tool", toolName: "echo", args: { value: 1 } },
  ]);

  const result = await runAgentTurn({
    agentId: "agent-1",
    sessionId: "session-1",
    userMessage: "bad echo",
    model,
    store,
    tools: [echoTool()],
    createId: fixedIds("turn-3"),
    now: fixedNow(3000),
  });

  assertEquals(result.state, "blocked");
  assertEquals(result.record.error?.code, "invalid_tool_args");
  assertEquals(result.record.toolExecutions[0].state, "failed");
});

Deno.test("side-effect tool creates ProposedAction and waits for boundary approval", async () => {
  const store = new InMemoryKvStore();
  const model = new StaticModelRuntime([
    { kind: "call_tool", toolName: "write_file", args: { path: "note.txt" } },
  ]);

  const result = await runAgentTurn({
    agentId: "agent-1",
    sessionId: "session-1",
    userMessage: "write",
    model,
    store,
    tools: [writeFileTool()],
    createId: fixedIds(
      "turn-4",
      "event-1",
      "event-2",
      "event-3",
      "event-4",
      "tool-1",
      "boundary-1",
    ),
    now: fixedNow(4000),
  });

  assertEquals(result.state, "waiting_boundary");
  assertEquals(result.record.toolExecutions[0].state, "waiting_boundary");
  assertEquals(result.record.proposedActions[0].state, "ready");
  assertEquals(result.record.boundaryRequests[0].state, "pending");
  assertEquals(result.record.toolExecutions[0].proposedActionId, "action-note.txt");
  assertEquals(
    result.record.toolExecutions[0].boundaryRequestId,
    result.record.boundaryRequests[0].id,
  );
});

Deno.test("SafetyActionGate rejects stale approved actions before apply", async () => {
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1"),
    now: fixedNow(5000),
  });

  const request = gate.createBoundaryRequest("edit file", {
    id: "action-1",
    kind: "file_edit",
    title: "Edit file",
    target: "file://note.txt",
    beforeHash: "old",
    state: "draft",
  });
  const approved = gate.approveBoundaryRequest(request);

  const result = await gate.applyAction({
    action: approved.action,
    currentHash: "new",
    apply: () => Promise.resolve("should not run"),
  });

  assertEquals(result.applied, false);
  assertEquals(result.action.state, "stale");
  assertEquals(result.error?.code, "action_stale");
});

Deno.test("SafetyActionGate records boundary rejection and applied actions into TurnRecord", async () => {
  const gate = new SafetyActionGate({
    createId: fixedIds("boundary-1", "applied-1"),
    now: fixedNow(6000),
  });
  const request = gate.createBoundaryRequest("edit file", {
    id: "action-1",
    kind: "file_edit",
    title: "Edit file",
    target: "file://note.txt",
    state: "draft",
  });
  const rejected = gate.resolveBoundaryRequest(request, "rejected");

  const baseRecord = {
    id: "turn-1",
    agentId: "agent-1",
    sessionId: "session-1",
    taskId: null,
    startedAt: 6000,
    inputMessageIds: [],
    promptDigest: "digest",
    events: [],
    eventEngineRecords: [],
    toolExecutions: [],
    boundaryRequests: [request],
    proposedActions: [request.action],
    appliedActions: [],
    modelRoutes: [],
    finalState: "waiting_boundary" as const,
  };

  const rejectedRecord = gate.recordBoundaryResolution(baseRecord, rejected);
  assertEquals(rejectedRecord.boundaryRequests[0].state, "rejected");
  assertEquals(rejectedRecord.proposedActions[0].state, "rejected");

  const approved = gate.resolveBoundaryRequest(request, "approved");
  const applyResult = await gate.applyAction({
    action: approved.action,
    apply: () => Promise.resolve({ ok: true }),
  });
  const appliedRecord = gate.recordAppliedAction(
    gate.recordBoundaryResolution(baseRecord, approved),
    applyResult,
  );

  assertEquals(applyResult.applied, true);
  assertEquals(appliedRecord.proposedActions[0].state, "applied");
  assertEquals(appliedRecord.appliedActions[0].state, "applied");
});

function echoTool(): ToolDefinition {
  return {
    name: "echo",
    validateArgs(args) {
      return isRecord(args) && typeof args.text === "string" ? { ok: true, args } : {
        ok: false,
        error: {
          code: "invalid_tool_args",
          message: "echo.text must be a string.",
        },
      };
    },
    run(args) {
      assertExists(args);
      return Promise.resolve(args);
    },
  };
}

function writeFileTool(): ToolDefinition {
  return {
    name: "write_file",
    validateArgs(args) {
      return isRecord(args) && typeof args.path === "string" ? { ok: true, args } : {
        ok: false,
        error: {
          code: "invalid_tool_args",
          message: "write_file.path must be a string.",
        },
      };
    },
    proposeAction(args) {
      if (!isRecord(args) || typeof args.path !== "string") {
        return null;
      }

      return {
        id: `action-${args.path}`,
        kind: "file_edit",
        title: "Write file",
        target: `file://${args.path}`,
        preview: "create or update file",
        state: "draft",
      };
    },
    run() {
      return Promise.resolve({ ok: true });
    },
  };
}

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
