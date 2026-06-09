import { assertEquals } from "jsr:@std/assert";

import {
  ArtifactKernel,
  CompletionJudge,
  hasVerifiableEvidence,
  InMemoryKvStore,
  type SubagentRuntimeAdapter,
  SubagentRuntimeBridge,
  SubagentTaskKernel,
} from "../../src/mod.ts";

Deno.test("CompletionJudge records a verification artifact for evidence-backed approval", async () => {
  const store = new InMemoryKvStore();
  const subagents = new SubagentTaskKernel({
    store,
    createId: fixedIds("judge-task-1"),
    now: fixedNow(1000),
  });
  const adapter: SubagentRuntimeAdapter = {
    run() {
      return Promise.resolve({
        verdict: "done",
        reason: "all checks passed",
        scores: {
          accuracy: 95,
          completeness: 90,
          consistency: 88,
          format: 80,
        },
      });
    },
  };
  const judge = new CompletionJudge({
    bridge: new SubagentRuntimeBridge({ subagents, adapter }),
    artifacts: new ArtifactKernel({
      store,
      createId: fixedIds("artifact-1"),
      now: fixedNow(2000),
    }),
  });

  const result = await judge.judge({
    parentTurnId: "turn-1",
    executorAgentId: "agent-main",
    judgeAgentId: "reviewer",
    taskId: "task-1",
    goal: "ship the migration",
    doneCriteria: ["tests pass", "docs updated"],
    verifyCommand: "deno task check",
    evidence: [
      "Task check output:",
      "Check file:///repo/domains/e/src/app/completion-judge.ts",
      "ok | 42 passed | 0 failed",
    ].join("\n"),
  });

  assertEquals(result.verdict, "done");
  assertEquals(result.scores.accuracy, 95);
  assertEquals(result.artifact?.kind, "verification");
  assertEquals(result.artifact?.taskId, "task-1");
});

Deno.test("CompletionJudge rejects unverifiable evidence before calling the judge agent", async () => {
  assertEquals(hasVerifiableEvidence("应该已经可以了，probably works"), false);

  let called = false;
  const store = new InMemoryKvStore();
  const subagents = new SubagentTaskKernel({ store });
  const judge = new CompletionJudge({
    bridge: new SubagentRuntimeBridge({
      subagents,
      adapter: {
        run() {
          called = true;
          return Promise.resolve({ verdict: "done", reason: "ok", scores: {} });
        },
      },
    }),
  });

  const result = await judge.judge({
    parentTurnId: "turn-1",
    executorAgentId: "agent-main",
    judgeAgentId: "reviewer",
    goal: "ship",
    doneCriteria: ["verified"],
    verifyCommand: "deno task check",
    evidence: "应该可以了，probably works",
  });

  assertEquals(result.verdict, "continue");
  assertEquals(called, false);
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
