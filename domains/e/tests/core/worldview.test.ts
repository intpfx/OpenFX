import { assertEquals } from "jsr:@std/assert";

import {
  mergeWorldViewStatements,
  proposeWorldViewCandidates,
  selectPromptWorldViewStatements,
} from "../../src/mod.ts";

Deno.test("advanced worldview proposes, merges, and filters prompt statements", () => {
  const candidates = proposeWorldViewCandidates({
    agentId: "agent-1",
    memories: [
      { id: "m1", content: "prefer concise answers", salience: 9 },
      { id: "m2", content: "prefer concise answers", salience: 8 },
      { id: "m3", content: "not prefer concise answers", salience: 9 },
      { id: "m4", content: "low salience", salience: 2 },
    ],
    createId: fixedIds("w1", "w2", "w3"),
    now: fixedNow(1000),
  });
  const merged = mergeWorldViewStatements(candidates);
  const selected = selectPromptWorldViewStatements(merged, 5);

  assertEquals(candidates.length, 3);
  assertEquals(merged.length, 2);
  assertEquals(merged.some((statement) => statement.conflictWith?.length), true);
  assertEquals(selected.length, 0);
});

function fixedIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function fixedNow(value: number): () => number {
  return () => value;
}
