import { assertEquals } from "jsr:@std/assert";

import { ArtifactKernel, InMemoryKvStore } from "../../src/mod.ts";

Deno.test("ArtifactKernel records artifacts and summarizes completion from patch and verification facts", async () => {
  const artifacts = new ArtifactKernel({
    store: new InMemoryKvStore(),
    createId: fixedIds("artifact-1", "artifact-2", "artifact-3"),
    now: increasingNow(1000),
  });

  await artifacts.record({
    taskId: "task-1",
    turnId: "turn-1",
    kind: "discovery",
    summary: "AStudio has task graph patterns worth absorbing.",
  });
  await artifacts.record({
    taskId: "task-1",
    turnId: "turn-2",
    kind: "patch_summary",
    path: "domains/e/src/core/task-graph.ts",
    summary: "Added task graph kernel and work order validation.",
    payload: { changedFiles: ["domains/e/src/core/types.ts"] },
  });
  await artifacts.record({
    taskId: "task-1",
    turnId: "turn-3",
    kind: "verification",
    summary: "deno task --config domains/e/deno.json test passed.",
  });

  assertEquals((await artifacts.list({ taskId: "task-1" })).map((item) => item.id), [
    "artifact-1",
    "artifact-2",
    "artifact-3",
  ]);
  assertEquals((await artifacts.list({ turnId: "turn-2" })).map((item) => item.id), [
    "artifact-2",
  ]);

  assertEquals(await artifacts.summarizeCompletion("task-1"), {
    summary: "Added task graph kernel and work order validation.",
    changedFiles: [
      "domains/e/src/core/types.ts",
      "domains/e/src/core/task-graph.ts",
    ],
    tests: ["deno task --config domains/e/deno.json test passed."],
    artifactIds: ["artifact-1", "artifact-2", "artifact-3"],
  });
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function increasingNow(start: number): () => number {
  let value = start;
  return () => value++;
}
