import { assertEquals } from "jsr:@std/assert";

import {
  createPeerTools,
  InMemoryKvStore,
  PeerCommunicationKernel,
  SafetyActionGate,
  ToolRunner,
} from "../../src/mod.ts";

Deno.test("peer tools bridge ToolRunner to PeerCommunicationKernel", async () => {
  const peers = new PeerCommunicationKernel({
    store: new InMemoryKvStore(),
    createId: fixedIds("message-1", "conversation-1", "tool-1"),
    now: fixedNow(1000),
  });
  await peers.register({
    agentId: "agent-b",
    displayName: "Agent B",
    purpose: "review",
    capabilities: ["review"],
    status: "idle",
    queueDepth: 0,
  });

  const runner = new ToolRunner(
    createPeerTools({
      peers,
      cancellation: neverCancelled(),
    }),
    {
      now: fixedNow(1000),
      createId: fixedIds("tool-1"),
      safetyGate: new SafetyActionGate({
        now: fixedNow(1000),
        createId: fixedIds("b1"),
      }),
    },
  );
  const result = await runner.run({
    kind: "call_tool",
    toolName: "peer_send",
    args: {
      senderAgentId: "agent-a",
      targetAgentId: "agent-b",
      body: "hello",
    },
  });

  assertEquals(result.execution.state, "succeeded");
  assertEquals((await peers.listInbox("agent-b"))[0].envelope.id, "message-1");
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}

function neverCancelled() {
  return { cancelled: false, throwIfCancelled() {} };
}
