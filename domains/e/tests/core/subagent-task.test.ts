import { assertEquals } from "jsr:@std/assert";

import { InMemoryKvStore, SubagentTaskKernel } from "../../src/mod.ts";

Deno.test("SubagentTaskKernel completes typed subagent results", async () => {
  const store = new InMemoryKvStore();
  const subagents = new SubagentTaskKernel({
    store,
    createId: fixedIds("task-1"),
    now: fixedNow(1000),
  });

  const task = await subagents.create({
    parentTurnId: "turn-1",
    parentAgentId: "agent-main",
    agentId: "agent-reviewer",
    prompt: "review this patch",
    resultSchema: { type: "object", required: ["summary"] },
  });
  await subagents.start(task.id);
  const completed = await subagents.complete(task.id, { summary: "looks good" });
  const listed = await subagents.listForParentTurn("turn-1");

  assertEquals(completed.state, "completed");
  assertEquals(listed[0].id, task.id);
});

Deno.test("SubagentTaskKernel fails results that do not match the schema", async () => {
  const store = new InMemoryKvStore();
  const subagents = new SubagentTaskKernel({
    store,
    createId: fixedIds("task-1"),
    now: fixedNow(1000),
  });

  const task = await subagents.create({
    parentTurnId: "turn-1",
    parentAgentId: "agent-main",
    agentId: "agent-reviewer",
    prompt: "return a summary",
    resultSchema: { type: "object", required: ["summary"] },
  });
  const failed = await subagents.complete(task.id, { notes: "missing summary" });

  assertEquals(failed.state, "failed");
  assertEquals(failed.error?.code, "schema_required_missing");
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
