import { assertEquals } from "jsr:@std/assert";

import {
  EAgentRuntime,
  InMemoryFileResourceReader,
  InMemoryKvStore,
  StaticModelRuntime,
  type WorkspaceResource,
  WorkspaceResources,
} from "../../src/mod.ts";

Deno.test("EAgentRuntime runs a queued read-resource scenario end to end", async () => {
  const store = new InMemoryKvStore();
  const runtime = new EAgentRuntime({
    agentId: "agent-1",
    sessionId: "session-1",
    store,
    model: new StaticModelRuntime([
      {
        kind: "call_tool",
        toolName: "read_resource",
        args: { uri: "file:///workspace/brief.md", anchorText: "e framework" },
      },
      {
        kind: "complete",
        result: "The brief says the e framework should stay small and replayable.",
      },
    ]),
    workspaceResources: new WorkspaceResources({
      agentId: "agent-1",
      sessionId: "session-1",
      store,
      fileReader: new InMemoryFileResourceReader({
        "/workspace/brief.md": [
          "# MVP Brief",
          "The e framework should stay small and replayable.",
          "Use tools through the runtime.",
        ].join("\n"),
      }),
    }),
    createId: fixedIds(
      "queue-1",
      "turn-1",
      "observe-1",
      "user-message-1",
      "event-1",
      "event-2",
      "event-3",
      "tool-1",
      "queue-2",
      "turn-2",
      "observe-2",
      "tool-message-1",
      "user-message-2",
      "event-4",
      "event-5",
      "event-6",
      "assistant-message-1",
      "hindsight-1",
      "observe-3",
    ),
    now: increasingNow(1000),
  });

  await runtime.enqueueUserMessage("Read file:///workspace/brief.md and summarize it.");

  const steps = await runtime.runUntilIdle();
  const self = await runtime.registerSelf();
  const messages = await runtime.sessionManager.replaySession("agent-1", "session-1");
  const memories = await collectKeys(store.list("agent:agent-1:memory:hindsight:"));

  assertEquals(steps.length, 2);
  assertEquals(steps[0].turn.state, "completed");
  assertEquals(steps[0].turn.record.toolExecutions[0].state, "succeeded");
  assertEquals(
    steps[0].followUpQueued?.content.includes("Tool result from read_resource"),
    true,
  );
  assertEquals(steps[1].turn.decision, {
    kind: "complete",
    result: "The brief says the e framework should stay small and replayable.",
  });

  const resource = steps[0].turn.record.toolExecutions[0].result as WorkspaceResource;
  assertEquals(resource.uri, "file:///workspace/brief.md");
  assertEquals(resource.anchors?.[0].line, 2);
  assertEquals(resource.anchors?.[0].text, "e framework");

  assertEquals(messages.map((message) => message.role), [
    "user",
    "tool",
    "user",
    "assistant",
  ]);
  assertEquals(
    messages.at(-1)?.content,
    "The brief says the e framework should stay small and replayable.",
  );
  assertEquals(self.agentId, "agent-1");
  assertEquals((await runtime.peers.list()).map((card) => card.agentId), ["agent-1"]);
  assertEquals(memories.length, 2);
});

Deno.test("EAgentRuntime marks queued message failed when the turn blocks", async () => {
  const store = new InMemoryKvStore();
  const runtime = new EAgentRuntime({
    agentId: "agent-1",
    sessionId: "session-1",
    store,
    model: new StaticModelRuntime([
      { kind: "call_tool", toolName: "read_resource", args: { path: "missing-uri" } },
    ]),
    workspaceResources: new WorkspaceResources({ agentId: "agent-1", store }),
    createId: fixedIds("queue-1", "turn-1", "observe-1", "user-message-1"),
    now: increasingNow(2000),
  });

  await runtime.enqueueUserMessage("bad read");
  const steps = await runtime.runUntilIdle();
  const failedMessages = await runtime.queue.list("agent-1", "session-1", "failed");

  assertEquals(steps.length, 1);
  assertEquals(steps[0].turn.state, "blocked");
  assertEquals(failedMessages.length, 1);
  assertEquals(failedMessages[0].error?.code, "invalid_tool_args");
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
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
