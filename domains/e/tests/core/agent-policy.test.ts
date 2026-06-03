import { assertEquals } from "jsr:@std/assert";

import {
  AgentPolicy,
  InMemoryKvStore,
  runAgentTurn,
  StaticModelRuntime,
} from "../../src/mod.ts";

Deno.test("AgentPolicy blocks unauthorized tools in AgentLoop", async () => {
  const result = await runAgentTurn({
    agentId: "agent-1",
    sessionId: "session-1",
    userMessage: "run a tool",
    store: new InMemoryKvStore(),
    model: new StaticModelRuntime([
      { kind: "call_tool", toolName: "shell", args: {} },
    ]),
    agentPolicy: new AgentPolicy({ allowedTools: ["read_resource"] }),
    createId: fixedIds("turn-1", "event-1", "event-2", "message-1"),
    now: fixedNow(1000),
  });

  assertEquals(result.state, "blocked");
  assertEquals(result.record.error?.code, "tool_blocked_by_policy");
});

Deno.test("AgentPolicy upgrades high-risk tools to BoundaryRequest", async () => {
  const result = await runAgentTurn({
    agentId: "agent-1",
    sessionId: "session-1",
    userMessage: "run a tool",
    store: new InMemoryKvStore(),
    model: new StaticModelRuntime([
      { kind: "call_tool", toolName: "write_file", args: { path: "/workspace/a.ts" } },
    ]),
    agentPolicy: new AgentPolicy({
      allowedTools: ["write_file"],
      highRiskTools: ["write_file"],
      allowedPathPrefixes: ["/workspace/"],
    }),
    createId: fixedIds(
      "turn-1",
      "event-1",
      "event-2",
      "message-1",
      "event-3",
      "boundary-1",
      "event-4",
    ),
    now: fixedNow(1000),
  });

  assertEquals(result.state, "waiting_boundary");
  assertEquals(result.record.boundaryRequests.length, 1);
  assertEquals(result.record.proposedActions[0].target, "tool://write_file");
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
