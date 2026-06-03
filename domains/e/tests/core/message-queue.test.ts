import { assertEquals } from "jsr:@std/assert";

import { InMemoryKvStore, MessageQueue, queuePrefix } from "../../src/mod.ts";

Deno.test("MessageQueue dequeues by priority then FIFO and tracks terminal states", async () => {
  const store = new InMemoryKvStore();
  const queue = new MessageQueue({
    store,
    createId: fixedIds("low", "high"),
    now: increasingNow(1000),
  });

  await queue.enqueue({
    agentId: "agent-1",
    sessionId: "s1",
    content: "low",
    priority: 1,
  });
  await queue.enqueue({
    agentId: "agent-1",
    sessionId: "s1",
    content: "high",
    priority: 10,
  });

  const next = await queue.dequeue("agent-1", "s1");
  assertEquals(next?.content, "high");
  assertEquals(next?.state, "processing");

  const completed = await queue.complete(next!);
  assertEquals(completed.state, "completed");

  const queued = await queue.list("agent-1", "s1", "queued");
  const keys = await collectKeys(store.list(queuePrefix("agent-1", "s1")));

  assertEquals(queued.map((message) => message.content), ["low"]);
  assertEquals(keys, [
    "agent:agent-1:queue:s1:1000:low",
    "agent:agent-1:queue:s1:1001:high",
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

async function collectKeys(entries: AsyncIterable<{ key: string }>): Promise<string[]> {
  const keys: string[] = [];
  for await (const entry of entries) {
    keys.push(entry.key);
  }
  return keys;
}
