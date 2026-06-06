import { assertEquals, assertRejects } from "jsr:@std/assert";

import {
  InMemoryKvStore,
  TaskGraphKernel,
  validateAgentWorkOrder,
} from "../../src/mod.ts";

Deno.test("TaskGraphKernel detects dependency-ready tasks and validates transitions", async () => {
  const tasks = new TaskGraphKernel({
    store: new InMemoryKvStore(),
    createId: fixedIds("task-1", "task-2"),
    now: increasingNow(1000),
  });

  const dependency = await tasks.create({
    title: "Map current system",
    priority: "high",
  });
  const child = await tasks.create({
    title: "Implement framework kernel",
    dependsOnTaskIds: [dependency.id],
    priority: "critical",
  });

  assertEquals((await tasks.detectReadyTasks()).map((task) => task.id), [
    dependency.id,
  ]);

  await tasks.updateStatus(dependency.id, "ready");
  await tasks.updateStatus(dependency.id, "running");
  await tasks.updateStatus(dependency.id, "review");
  await tasks.updateStatus(dependency.id, "done");

  const ready = await tasks.detectReadyTasks();
  assertEquals(ready.map((task) => task.id), [child.id]);

  await assertRejects(
    () => tasks.updateStatus(dependency.id, "running"),
    Error,
    "Invalid task transition",
  );
});

Deno.test("TaskGraphKernel validates work orders before storing them", async () => {
  const tasks = new TaskGraphKernel({
    store: new InMemoryKvStore(),
    createId: fixedIds("task-1", "work-1"),
    now: increasingNow(2000),
  });
  const task = await tasks.create({ title: "Ship adapter shape" });

  const workOrder = await tasks.createWorkOrder({
    taskId: task.id,
    assignedAgentId: "agent-1",
    allowedPaths: [".", "domains/e/src/core"],
    requiredArtifacts: ["patch_summary", "verification"],
    successCriteria: ["Tests pass"],
    verificationCommands: [{
      cwd: ".",
      program: "deno",
      args: ["task", "test"],
    }],
    fallbackPlan: "Return a boundary request if the work leaves domains/e.",
  });

  assertEquals(workOrder.goal, "Ship adapter shape");
  assertEquals((await tasks.listWorkOrders(task.id)).map((item) => item.id), [
    "work-1",
  ]);
  assertEquals(validateAgentWorkOrder(workOrder), { ok: true });

  await assertRejects(
    () =>
      tasks.createWorkOrder({
        taskId: task.id,
        assignedAgentId: "agent-1",
        allowedPaths: ["/tmp/outside"],
        requiredArtifacts: ["patch_summary"],
        successCriteria: ["No outside writes"],
        fallbackPlan: "Ask for approval.",
      }),
    Error,
    "paths must be relative",
  );
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function increasingNow(start: number): () => number {
  let value = start;
  return () => value++;
}
