import { assertEquals } from "jsr:@std/assert";

import {
  CollaborationRecipeRunner,
  InMemoryKvStore,
  type SubagentRuntimeAdapter,
  SubagentRuntimeBridge,
  SubagentTaskKernel,
} from "../../src/mod.ts";

Deno.test("CollaborationRecipeRunner feeds sequential output into the next step", async () => {
  const prompts: string[] = [];
  const runner = createRunner((task) => {
    prompts.push(task.prompt);
    return Promise.resolve({
      output: `${task.agentId}:${task.prompt.includes("Previous step output")}`,
    });
  });

  const result = await runner.sequential({
    parentTurnId: "turn-1",
    parentAgentId: "agent-main",
    steps: [
      { agentId: "researcher", task: "find facts" },
      { agentId: "writer", task: "write summary" },
    ],
  });

  assertEquals(result.kind, "sequential");
  assertEquals(result.steps.map((step) => step.state), ["completed", "completed"]);
  assertEquals(result.finalOutput, "writer:true");
  assertEquals(prompts[0].includes("Previous step output"), false);
  assertEquals(prompts[1].includes("Previous step output"), true);
});

Deno.test("CollaborationRecipeRunner runs critic review until approval", async () => {
  let creatorCalls = 0;
  let reviewerCalls = 0;
  const runner = createRunner((task) => {
    if (task.agentId === "creator") {
      creatorCalls++;
      return Promise.resolve({
        output: creatorCalls === 1 ? "draft v1" : "draft v2",
      });
    }

    reviewerCalls++;
    return Promise.resolve({
      output: reviewerCalls === 1 ? "needs detail" : "APPROVED",
      approved: reviewerCalls > 1,
      feedback: reviewerCalls === 1 ? "add the missing detail" : "approved",
    });
  });

  const result = await runner.criticReview({
    parentTurnId: "turn-1",
    parentAgentId: "agent-main",
    creatorAgentId: "creator",
    reviewerAgentId: "reviewer",
    task: "write a migration note",
    maxRounds: 3,
  });

  assertEquals(result.approved, true);
  assertEquals(result.finalDraft, "draft v2");
  assertEquals(result.reviewerFeedback, ["add the missing detail", "approved"]);
  assertEquals(result.steps.map((step) => step.role), [
    "creator",
    "reviewer",
    "creator",
    "reviewer",
  ]);
});

function createRunner(run: SubagentRuntimeAdapter["run"]): CollaborationRecipeRunner {
  const store = new InMemoryKvStore();
  const subagents = new SubagentTaskKernel({
    store,
    createId: increasingIds("task"),
    now: increasingNow(1000),
  });
  const bridge = new SubagentRuntimeBridge({
    subagents,
    adapter: { run },
    now: increasingNow(2000),
  });
  return new CollaborationRecipeRunner({
    bridge,
    now: increasingNow(3000),
  });
}

function increasingIds(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function increasingNow(start: number): () => number {
  let value = start;
  return () => value++;
}
