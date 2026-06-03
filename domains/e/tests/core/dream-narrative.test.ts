import { assertEquals } from "jsr:@std/assert";

import { DreamNarrativeKernel, type MemoryEntry } from "../../src/mod.ts";

Deno.test("DreamNarrativeKernel drafts replayable memory narratives", () => {
  const dream = new DreamNarrativeKernel({
    createId: fixedIds("dream-1"),
    now: fixedNow(1000),
  }).draft("agent-1", [
    memory("m1", "older", 1),
    memory("m2", "newer", 2),
  ]);

  assertEquals(dream.memoryIds, ["m2", "m1"]);
  assertEquals(dream.content.includes("newer"), true);
  assertEquals(dream.confidence, 0.4);
});

function memory(id: string, content: string, createdAt: number): MemoryEntry {
  return {
    id,
    agentId: "agent-1",
    kind: "fact",
    content,
    source: "test",
    salience: 5,
    createdAt,
  };
}

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
