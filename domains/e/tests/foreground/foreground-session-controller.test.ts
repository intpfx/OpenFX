import { assertEquals } from "jsr:@std/assert";

import {
  EAgentRuntime,
  ForegroundSessionController,
  InMemoryFileResourceReader,
  InMemoryKvStore,
  RuntimeEventBridge,
  StaticModelRuntime,
  WorkspaceResources,
} from "../../src/mod.ts";

Deno.test("ForegroundSessionController separates foreground progress from background runtime", async () => {
  const store = new InMemoryKvStore();
  const runtime = new EAgentRuntime({
    agentId: "agent-1",
    sessionId: "session-1",
    store,
    model: new StaticModelRuntime([
      {
        kind: "call_tool",
        toolName: "read_resource",
        args: { uri: "file:///workspace/brief.md" },
      },
      { kind: "complete", result: "done" },
    ]),
    workspaceResources: new WorkspaceResources({
      agentId: "agent-1",
      sessionId: "session-1",
      store,
      fileReader: new InMemoryFileResourceReader({
        "/workspace/brief.md": "foreground/background separation",
      }),
    }),
    createId: fixedIds(
      "queue-1",
      "turn-1",
      "user-message-1",
      "tool-1",
      "queue-2",
      "turn-2",
    ),
    now: increasingNow(1000),
  });
  const controller = new ForegroundSessionController({
    runtime,
    bridge: new RuntimeEventBridge({
      createId: fixedIds(
        "progress-1",
        "progress-2",
        "progress-3",
        "progress-4",
        "progress-5",
        "progress-6",
        "progress-7",
      ),
      now: increasingNow(2000),
    }),
  });

  await controller.submitUserMessage("read the brief");
  const steps = await controller.runBackgroundUntilIdle();
  const eventTypes = controller.progressEvents().map((event) => event.type);

  assertEquals(steps.length, 2);
  assertEquals(eventTypes, [
    "foreground:started",
    "foreground:user_message",
    "runtime:queued",
    "runtime:step_started",
    "runtime:step_completed",
    "runtime:step_started",
    "runtime:step_completed",
    "runtime:idle",
  ]);
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function increasingNow(start: number): () => number {
  let value = start;
  return () => value++;
}
