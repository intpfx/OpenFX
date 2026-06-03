import { assertEquals } from "jsr:@std/assert";

import {
  InMemoryKvStore,
  SessionManager,
  sessionMessagePrefix,
} from "../../src/mod.ts";

Deno.test("SessionManager appends, lists, and replays messages in key order", async () => {
  const store = new InMemoryKvStore();
  const session = new SessionManager({
    store,
    createId: fixedIds("m1", "m2"),
    now: increasingNow(1000),
  });

  await session.appendMessage({
    agentId: "agent-1",
    sessionId: "s1",
    role: "user",
    content: "hello",
  });
  await session.appendMessage({
    agentId: "agent-1",
    sessionId: "s1",
    role: "assistant",
    content: "hi",
  });

  const replay = await session.replaySession("agent-1", "s1");
  const keys = await collectKeys(store.list(sessionMessagePrefix("agent-1", "s1")));

  assertEquals(replay.map((message) => message.content), ["hello", "hi"]);
  assertEquals(keys, [
    "agent:agent-1:session:s1:message:1000:m1",
    "agent:agent-1:session:s1:message:1001:m2",
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
