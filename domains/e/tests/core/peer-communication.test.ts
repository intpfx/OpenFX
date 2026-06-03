import { assertEquals } from "jsr:@std/assert";

import {
  InMemoryKvStore,
  PeerCommunicationKernel,
  peerMessageKey,
} from "../../src/mod.ts";

Deno.test("PeerCommunicationKernel registers peers and completes a peer message", async () => {
  const store = new InMemoryKvStore();
  const peers = new PeerCommunicationKernel({
    store,
    createId: fixedIds("message-1", "conversation-1"),
    now: fixedNow(1000),
  });

  await peers.register({
    agentId: "agent-a",
    displayName: "Agent A",
    purpose: "planning",
    capabilities: ["plan"],
    status: "idle",
    queueDepth: 0,
  });
  await peers.register({
    agentId: "agent-b",
    displayName: "Agent B",
    purpose: "review",
    capabilities: ["review"],
    status: "idle",
    queueDepth: 0,
  });

  const message = await peers.send({
    senderAgentId: "agent-a",
    targetAgentId: "agent-b",
    body: { question: "review this plan" },
  });
  await peers.markProcessing(message.envelope.id);
  const completed = await peers.complete(message.envelope.id, { ok: true });
  const inbox = await peers.listInbox("agent-b");

  assertEquals((await peers.list()).map((card) => card.agentId), [
    "agent-a",
    "agent-b",
  ]);
  assertEquals(completed.state, "completed");
  assertEquals(inbox[0].state, "completed");
  assertEquals(await store.get(peerMessageKey("message-1")), completed);
});

Deno.test("PeerCommunicationKernel expires and awaits messages with explicit limits", async () => {
  const store = new InMemoryKvStore();
  let now = 1000;
  const peers = new PeerCommunicationKernel({
    store,
    createId: fixedIds("message-1", "conversation-1"),
    now: () => now,
    sleep: () => {
      now += 50;
      return Promise.resolve();
    },
  });

  const message = await peers.send({
    senderAgentId: "agent-a",
    targetAgentId: "agent-b",
    body: "slow question",
    ttlMs: 25,
  });

  now = 1100;
  const expired = await peers.get(message.envelope.id);
  const awaited = await peers.awaitMessage(message.envelope.id, {
    timeoutMs: 100,
    cancellation: neverCancelled(),
  });

  assertEquals(expired?.state, "expired");
  assertEquals(awaited.state, "expired");
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}

function neverCancelled() {
  return {
    get cancelled() {
      return false;
    },
    throwIfCancelled() {},
  };
}
