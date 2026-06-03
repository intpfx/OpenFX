import { assertEquals, assertRejects } from "jsr:@std/assert";

import { ChannelKernel, InMemoryKvStore } from "../../src/mod.ts";

Deno.test("ChannelKernel stores ordered messages and advances speakers", async () => {
  const channel = new ChannelKernel({
    store: new InMemoryKvStore(),
    createId: fixedIds("channel-1", "message-1", "message-2"),
    now: increasingNow(1000),
  });

  const created = await channel.create({
    name: "review room",
    memberAgentIds: ["agent-a", "agent-b"],
  });
  assertEquals(await channel.nextSpeaker(created.id), "agent-a");

  await channel.appendMessage(created.id, "agent-a", "first");
  assertEquals(await channel.nextSpeaker(created.id), "agent-b");
  await channel.appendMessage(created.id, "agent-b", "second");

  assertEquals(
    (await channel.listMessages(created.id)).map((message) => message.content),
    [
      "first",
      "second",
    ],
  );
  await assertRejects(
    () => channel.appendMessage(created.id, "agent-c", "nope"),
    Error,
    "not a channel member",
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
