import { assertEquals } from "jsr:@std/assert";

import {
  InMemoryKvStore,
  PeerCommunicationKernel,
  speculativePeerByMessageKey,
  SpeculativePeerCoordinator,
} from "../../src/mod.ts";

Deno.test("SpeculativePeerCoordinator pairs async peer replies with predictions", async () => {
  const store = new InMemoryKvStore();
  const peers = new PeerCommunicationKernel({
    store,
    createId: fixedIds("peer-1", "conversation-1"),
    now: fixedNow(1000),
  });
  const coordinator = new SpeculativePeerCoordinator({
    store,
    peers,
    now: increasingNow(2000),
  });

  const pending = await coordinator.send({
    senderAgentId: "agent-a",
    targetAgentId: "agent-b",
    body: { question: "which plan should we keep?" },
    prediction: "use plan a",
    workingContext: "agent-a continues implementing plan a while waiting",
  });
  await peers.complete(pending.peerMessageId, {
    output: "Use plan A and keep the boundary review.",
  });

  const synced = await coordinator.sync(pending.peerMessageId);
  const consumed = await coordinator.consumeReady("agent-a");

  assertEquals(pending.id, "peer-1");
  assertEquals(
    await store.get(speculativePeerByMessageKey("peer-1")),
    [
      "agent:agent-a:speculative-peer:1000:peer-1",
    ][0],
  );
  assertEquals(synced.state, "completed");
  assertEquals(synced.comparison, "aligned");
  assertEquals(consumed.length, 1);
  assertEquals(consumed[0].state, "completed");
  assertEquals(consumed[0].consumedAt !== undefined, true);
});

Deno.test("SpeculativePeerCoordinator keeps pending replies until peer work finishes", async () => {
  const store = new InMemoryKvStore();
  const peers = new PeerCommunicationKernel({
    store,
    createId: fixedIds("peer-1", "conversation-1"),
    now: fixedNow(1000),
  });
  const coordinator = new SpeculativePeerCoordinator({ store, peers });

  const pending = await coordinator.send({
    senderAgentId: "agent-a",
    targetAgentId: "agent-b",
    body: "review later",
    prediction: "approve",
  });
  await peers.markProcessing(pending.peerMessageId);

  const synced = await coordinator.sync(pending.peerMessageId);
  const consumed = await coordinator.consumeReady("agent-a");

  assertEquals(synced.state, "pending");
  assertEquals(consumed.length, 0);
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}

function increasingNow(start: number): () => number {
  let value = start;
  return () => value++;
}
