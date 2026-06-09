import { assertEquals } from "jsr:@std/assert";

import {
  InMemoryKvStore,
  type SubagentRuntimeAdapter,
  SubagentRuntimeBridge,
  SubagentTaskKernel,
  type TurnRecord,
} from "../../src/mod.ts";

Deno.test("SubagentRuntimeBridge runs typed tasks without inheriting tools by default", async () => {
  const store = new InMemoryKvStore();
  const subagents = new SubagentTaskKernel({
    store,
    createId: fixedIds("task-1"),
    now: fixedNow(1000),
  });
  const seenAllowedTools: string[][] = [];
  const adapter: SubagentRuntimeAdapter = {
    run(_task, context) {
      seenAllowedTools.push(context.allowedTools);
      return Promise.resolve({ output: "review complete" });
    },
  };
  const bridge = new SubagentRuntimeBridge({
    subagents,
    adapter,
    createId: fixedIds("event-1", "event-2", "event-3"),
    now: increasingNow(2000),
  });

  const result = await bridge.run({
    parentTurnId: "turn-1",
    parentAgentId: "agent-main",
    agentId: "agent-reviewer",
    prompt: "review this patch",
    resultSchema: { type: "object", required: ["output"] },
    turnRecord: minimalTurnRecord(),
  });

  assertEquals(result.task.state, "completed");
  assertEquals(result.output, { output: "review complete" });
  assertEquals(result.allowedTools, []);
  assertEquals(seenAllowedTools, [[]]);
  assertEquals(result.turnRecord?.events.map((event) => event.type), [
    "subagent:task_created",
    "subagent:task_started",
    "subagent:task_completed",
  ]);
});

Deno.test("SubagentRuntimeBridge fails closed when adapter output violates schema", async () => {
  const store = new InMemoryKvStore();
  const subagents = new SubagentTaskKernel({
    store,
    createId: fixedIds("task-1"),
    now: fixedNow(1000),
  });
  const adapter: SubagentRuntimeAdapter = {
    run() {
      return Promise.resolve({ note: "missing output" });
    },
  };
  const bridge = new SubagentRuntimeBridge({ subagents, adapter });

  const result = await bridge.run({
    parentTurnId: "turn-1",
    parentAgentId: "agent-main",
    agentId: "agent-reviewer",
    prompt: "return a structured result",
    resultSchema: { type: "object", required: ["output"] },
  });

  assertEquals(result.task.state, "failed");
  assertEquals(result.error?.code, "schema_required_missing");
});

function minimalTurnRecord(): TurnRecord {
  return {
    id: "turn-1",
    agentId: "agent-main",
    sessionId: "session-1",
    taskId: null,
    startedAt: 1000,
    inputMessageIds: [],
    promptDigest: "digest",
    events: [],
    eventEngineRecords: [],
    toolExecutions: [],
    boundaryRequests: [],
    proposedActions: [],
    appliedActions: [],
    modelRoutes: [],
    finalState: "queued",
  };
}

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}

function increasingNow(start: number): () => number {
  let value = start;
  return () => value++;
}
