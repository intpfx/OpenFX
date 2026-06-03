import { assertEquals } from "jsr:@std/assert";

import { validateAgentDecision } from "../../src/mod.ts";
import fixtures from "../fixtures/core-types.json" with { type: "json" };

Deno.test("core JSON fixtures cover public kernel records", () => {
  assertEquals(validateAgentDecision(fixtures.agentDecision), {
    ok: true,
    decision: { kind: "complete", result: "done" },
  });
  assertEquals(fixtures.turnRecord.finalState, "completed");
  assertEquals(fixtures.turnRecord.appliedActions, []);
  assertEquals(fixtures.workspaceResource.redaction, "none");
});
