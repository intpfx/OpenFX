import { assertEquals } from "jsr:@std/assert";

import { InMemoryKvStore, type PeerMessage, SocialGraph } from "../../src/mod.ts";

Deno.test("SocialGraph derives relations from peer facts", async () => {
  const graph = new SocialGraph({
    store: new InMemoryKvStore(),
    createId: fixedIds("relation-1"),
    now: fixedNow(1000),
  });
  const message: PeerMessage = {
    envelope: {
      id: "message-1",
      conversationId: "conversation-1",
      senderAgentId: "agent-a",
      targetAgentId: "agent-b",
      body: "review",
      hops: 0,
      maxHops: 4,
      ttlMs: 1000,
      createdAt: 1,
    },
    state: "completed",
    updatedAt: 2,
  };

  const relation = await graph.recordPeerMessage(message);
  const ranked = await graph.rankPeers("agent-a", "review");

  assertEquals(relation.label, "collaborator");
  assertEquals(relation.trust, 0.6);
  assertEquals(ranked[0].peerAgentId, "agent-b");
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
