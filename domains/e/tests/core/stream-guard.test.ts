import { assertEquals } from "jsr:@std/assert";

import { StreamGuard } from "../../src/mod.ts";

Deno.test("StreamGuard aborts when a blocking rule matches streamed content", () => {
  const guard = new StreamGuard([
    {
      id: "secret",
      description: "stop secrets",
      pattern: "API_KEY=",
      action: "abort_and_retry",
      severity: "block",
    },
  ]);

  const result = guard.inspectChunks(["safe text ", "API_KEY=123", " after"]);

  assertEquals(result.aborted, true);
  assertEquals(result.content, "safe text API_KEY=123");
  assertEquals(result.matches[0].ruleId, "secret");
});

Deno.test("StreamGuard injects reminders without aborting when rule is advisory", () => {
  const guard = new StreamGuard([
    {
      id: "needs-boundary",
      description: "external send needs approval",
      pattern: "send email",
      action: "inject_reminder",
      severity: "warn",
      reminder: "External sends require a BoundaryRequest.",
    },
  ]);

  const result = guard.inspectChunks(["please ", "send email"]);

  assertEquals(result.aborted, false);
  assertEquals(result.reminderMessages, ["External sends require a BoundaryRequest."]);
  assertEquals(result.matches[0].action, "inject_reminder");
});
