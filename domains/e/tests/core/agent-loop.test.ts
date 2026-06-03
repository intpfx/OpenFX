import { assertEquals, assertExists } from "jsr:@std/assert";

import {
  AgentStateKernel,
  EventEngine,
  InMemoryKvStore,
  runAgentTurn,
  SessionManager,
  StaticModelRuntime,
  type TurnRecord,
  turnRecordKey,
} from "../../src/mod.ts";

Deno.test("mock model can complete a turn and persist TurnRecord", async () => {
  const store = new InMemoryKvStore();
  const model = new StaticModelRuntime([{ kind: "complete", result: "done" }]);

  const result = await runAgentTurn({
    agentId: "agent-1",
    sessionId: "session-1",
    userMessage: "hello",
    model,
    store,
    createId: fixedIds("turn-1", "event-1", "event-2", "event-3", "event-4"),
    now: fixedNow(1000),
  });

  assertEquals(result.state, "completed");
  assertEquals(result.decision, { kind: "complete", result: "done" });

  const persisted = await store.get<TurnRecord>(turnRecordKey("agent-1", "turn-1"));
  assertExists(persisted);
  assertEquals(persisted.finalState, "completed");
  assertEquals(persisted.modelRoutes[0].role, "default");
});

Deno.test("invalid JSON gets one repair attempt", async () => {
  const store = new InMemoryKvStore();
  const model = new StaticModelRuntime([
    "not-json",
    { kind: "think", summary: "repair succeeded" },
  ]);

  const result = await runAgentTurn({
    agentId: "agent-1",
    sessionId: "session-1",
    userMessage: "think",
    model,
    store,
    createId: fixedIds("turn-2", "event-1", "event-2", "event-3", "event-4", "event-5"),
    now: fixedNow(2000),
  });

  assertEquals(result.state, "completed");
  assertEquals(result.decision, { kind: "think", summary: "repair succeeded" });
  assertEquals(result.record.modelRoutes.map((route) => route.role), [
    "default",
    "smol",
  ]);
});

Deno.test("repair failure blocks the turn and records the error", async () => {
  const store = new InMemoryKvStore();
  const model = new StaticModelRuntime(["not-json", "{"]);

  const result = await runAgentTurn({
    agentId: "agent-1",
    sessionId: "session-1",
    userMessage: "bad",
    model,
    store,
    createId: fixedIds("turn-3", "event-1", "event-2", "event-3", "event-4"),
    now: fixedNow(3000),
  });

  assertEquals(result.state, "blocked");
  assertEquals(result.record.error?.code, "invalid_agent_decision");
});

Deno.test("KV store scans session, memory, state, and heartbeat prefixes", async () => {
  const store = new InMemoryKvStore();
  await store.set("agent:a:session:s1:message:001:m1", { text: "one" });
  await store.set("agent:a:session:s1:message:002:m2", { text: "two" });
  await store.set("agent:a:memory:fact:9:m1", { text: "fact" });
  await store.set("agent:a:state", { ready: true });
  await store.set("agent:a:heartbeat:1000", { reason: "resume" });

  const sessionMessages = await collectKeys(store.list("agent:a:session:s1:message:"));
  const memories = await collectKeys(store.list("agent:a:memory:fact:"));
  const heartbeats = await collectKeys(store.list("agent:a:heartbeat:"));

  assertEquals(sessionMessages, [
    "agent:a:session:s1:message:001:m1",
    "agent:a:session:s1:message:002:m2",
  ]);
  assertEquals(memories, ["agent:a:memory:fact:9:m1"]);
  assertEquals(await store.get("agent:a:state"), { ready: true });
  assertEquals(heartbeats, ["agent:a:heartbeat:1000"]);
});

Deno.test("agent loop injects AgentState context and captures hindsight memory", async () => {
  const store = new InMemoryKvStore();
  const agentState = new AgentStateKernel({
    store,
    createId: fixedIds(
      "memory-1",
      "insight-1",
      "observe-1",
      "observe-2",
      "hindsight-1",
      "observe-3",
    ),
    now: fixedNow(4000),
  });
  await agentState.retainMemory("agent-1", "project uses concise docs", "test", {
    salience: 8,
  });
  await agentState.recordLateInsight("agent-1", "concise docs need examples");

  const model = new CapturingModelRuntime([{ kind: "complete", result: "done" }]);

  const result = await runAgentTurn({
    agentId: "agent-1",
    sessionId: "session-1",
    userMessage: "concise",
    model,
    store,
    agentState,
    createId: fixedIds("turn-4", "event-1", "event-2", "event-3", "event-4"),
    now: fixedNow(4000),
  });

  assertEquals(result.state, "completed");
  assertEquals(model.messages[0].content.includes("Relevant memories"), true);
  assertEquals(model.messages[0].content.includes("Cerebellum insights"), true);

  const hindsight = await collectKeys(store.list("agent:agent-1:memory:hindsight:"));
  assertEquals(hindsight.length, 1);
});

Deno.test("agent loop records session messages and event engine decision overrides", async () => {
  const store = new InMemoryKvStore();
  const sessionManager = new SessionManager({
    store,
    createId: fixedIds("user-message", "assistant-message"),
    now: increasingNow(5000),
  });
  const eventEngine = new EventEngine([
    {
      id: "inject",
      handle(context) {
        if (context.type === "model:before_call") {
          return {
            kind: "injectMessage",
            message: "Injected policy reminder.",
            priority: 10,
          };
        }
        return { kind: "none" };
      },
    },
    {
      id: "override",
      privileged: true,
      handle(context) {
        if (context.type === "decision:accepted") {
          return {
            kind: "overrideDecision",
            privileged: true,
            decision: { kind: "complete", result: "overridden" },
          };
        }
        return { kind: "none" };
      },
    },
  ]);
  const model = new CapturingModelRuntime([{ kind: "think", summary: "wait" }]);

  const result = await runAgentTurn({
    agentId: "agent-1",
    sessionId: "session-1",
    userMessage: "hello",
    model,
    store,
    sessionManager,
    eventEngine,
    createId: fixedIds("turn-5", "event-1", "event-2", "event-3", "event-4", "event-5"),
    now: fixedNow(5000),
  });

  const messages = await sessionManager.replaySession("agent-1", "session-1");

  assertEquals(result.state, "completed");
  assertEquals(result.decision, { kind: "complete", result: "overridden" });
  assertEquals(result.record.eventEngineRecords.length, 4);
  assertEquals(model.messages.at(-1)?.content, "Injected policy reminder.");
  assertEquals(messages.map((message) => [message.role, message.content]), [
    ["user", "hello"],
    ["assistant", "overridden"],
  ]);
});

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

async function collectKeys(entries: AsyncIterable<{ key: string }>): Promise<string[]> {
  const keys: string[] = [];
  for await (const entry of entries) {
    keys.push(entry.key);
  }
  return keys;
}

class CapturingModelRuntime extends StaticModelRuntime {
  messages: Array<{ role: string; content: string }> = [];

  override complete(request: Parameters<StaticModelRuntime["complete"]>[0]) {
    this.messages = request.messages;
    return super.complete(request);
  }
}
