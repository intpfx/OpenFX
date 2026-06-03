import { assertEquals, assertExists } from "jsr:@std/assert";

import {
  AgentStateKernel,
  agentStateKey,
  heartbeatKey,
  InMemoryKvStore,
  memoryKey,
  worldViewStatementKey,
} from "../../src/mod.ts";

Deno.test("AgentStateKernel creates persona state and stable system prompt", async () => {
  const store = new InMemoryKvStore();
  const state = new AgentStateKernel({
    store,
    createId: fixedIds("id-1"),
    now: fixedNow(1000),
  });

  const section = await state.buildSystemPromptSection("agent-1");
  const persisted = await store.get(agentStateKey("agent-1"));

  assertExists(persisted);
  assertEquals(section.content.includes("Agent: e"), true);
  assertEquals(section.personaDigest.length, 64);
});

Deno.test("AgentStateKernel retains and recalls memories by query and salience", async () => {
  const store = new InMemoryKvStore();
  const state = new AgentStateKernel({
    store,
    createId: fixedIds("m1", "m2"),
    now: fixedNow(2000),
  });

  const low = await state.retainMemory("agent-1", "likes concise docs", "test", {
    salience: 3,
  });
  const high = await state.retainMemory("agent-1", "concise answers matter", "test", {
    salience: 9,
  });

  const recalled = await state.recallMemories("agent-1", "concise", 1);

  assertEquals(recalled, [high]);
  assertEquals(await store.get(memoryKey(low)), low);
});

Deno.test("AgentStateKernel keeps a minimal WorldView in state and prompt context", async () => {
  const store = new InMemoryKvStore();
  const state = new AgentStateKernel({
    store,
    createId: fixedIds("worldview-1"),
    now: fixedNow(2500),
  });

  const statement = await state.updateWorldView("agent-1", {
    kind: "preference",
    content: "prefer runtime-neutral adapters",
    confidence: 1.5,
    source: "test",
  });
  const recalled = await state.recallWorldView("agent-1", "runtime", 1);
  const prompt = await state.buildSystemPromptSection("agent-1");

  assertEquals(statement.confidence, 1);
  assertEquals(recalled, [statement]);
  assertEquals(await store.get(worldViewStatementKey(statement)), statement);
  assertEquals(prompt.content.includes("WorldView:"), true);
  assertEquals(prompt.content.includes("runtime-neutral adapters"), true);
});

Deno.test("AgentStateKernel compacts session messages into summary memory", async () => {
  const store = new InMemoryKvStore();
  await store.set("agent:agent-1:session:s1:message:001:m1", {
    role: "user",
    text: "hi",
  });
  await store.set("agent:agent-1:session:s1:message:002:m2", {
    role: "assistant",
    text: "hello",
  });

  const state = new AgentStateKernel({
    store,
    createId: fixedIds("summary-1"),
    now: fixedNow(3000),
  });
  const summary = await state.compactSessionToMentalModel("agent-1", "s1");

  assertEquals(summary.kind, "summary");
  assertEquals(summary.content.includes("assistant"), true);
});

Deno.test("AgentStateKernel schedules heartbeat and records cerebellum insights", async () => {
  const store = new InMemoryKvStore();
  const state = new AgentStateKernel({
    store,
    createId: fixedIds("heartbeat-1", "insight-1", "late-1"),
    now: fixedNow(4000),
  });

  const heartbeat = await state.scheduleWakeup("agent-1", "resume", 9000);
  const attached = await state.attachCerebellumInsight(
    "agent-1",
    "turn-1",
    "prefer direct route",
  );
  const late = await state.recordLateInsight("agent-1", "late insight");
  const prefetched = await state.prefetchCerebellumContext("agent-1", "direct", 2);

  assertEquals(await store.get(heartbeatKey(heartbeat)), heartbeat);
  assertEquals(attached.turnId, "turn-1");
  assertEquals(late.late, true);
  assertEquals(prefetched.map((insight) => insight.id), ["insight-1", "late-1"]);
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
