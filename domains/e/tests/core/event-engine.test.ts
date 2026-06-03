import { assertEquals } from "jsr:@std/assert";

import { EventEngine, type EventHandler } from "../../src/mod.ts";

Deno.test("EventEngine chains modifyArgs and merges injected messages by priority and budget", async () => {
  const engine = new EventEngine([
    {
      id: "modify",
      handle(context) {
        return { kind: "modifyArgs", args: `${context.payload}:modified` };
      },
    },
    {
      id: "low",
      handle() {
        return {
          kind: "injectMessage",
          message: "low priority",
          priority: 1,
          tokenCost: 1,
        };
      },
    },
    {
      id: "high",
      handle() {
        return {
          kind: "injectMessage",
          message: "high priority",
          priority: 10,
          tokenCost: 1,
        };
      },
    },
  ], { tokenBudget: 1 });

  const result = await engine.emit("test", "input");

  assertEquals(result.payload, "input:modified");
  assertEquals(result.injectedMessages, ["high priority"]);
  assertEquals(result.blocked, false);
});

Deno.test("EventEngine blocks on first block signal", async () => {
  const engine = new EventEngine([
    {
      id: "blocker",
      handle() {
        return { kind: "block", reason: "policy" };
      },
    },
    {
      id: "after",
      handle() {
        return { kind: "injectMessage", message: "should not run", priority: 1 };
      },
    },
  ]);

  const result = await engine.emit("test", {});

  assertEquals(result.blocked, true);
  assertEquals(result.blockReason, "policy");
  assertEquals(result.records.length, 1);
});

Deno.test("EventEngine requires privileged overrideDecision and detects conflicts", async () => {
  const unprivileged = new EventEngine([
    {
      id: "bad",
      handle() {
        return {
          kind: "overrideDecision",
          privileged: false,
          decision: { kind: "complete", result: "bad" },
        };
      },
    },
  ]);

  const blocked = await unprivileged.emit("decision:accepted", {
    kind: "think",
    summary: "x",
  });

  assertEquals(blocked.blocked, true);

  const conflictingHandlers: EventHandler[] = [
    {
      id: "a",
      privileged: true,
      handle() {
        return {
          kind: "overrideDecision",
          privileged: true,
          decision: { kind: "complete", result: "a" },
        };
      },
    },
    {
      id: "b",
      privileged: true,
      handle() {
        return {
          kind: "overrideDecision",
          privileged: true,
          decision: { kind: "complete", result: "b" },
        };
      },
    },
  ];
  const conflicting = await new EventEngine(conflictingHandlers).emit(
    "decision:accepted",
    {},
  );

  assertEquals(conflicting.blocked, true);
  assertEquals(conflicting.blockReason, "Conflicting overrideDecision signals.");
});

Deno.test("EventEngine records handler errors without blocking by default", async () => {
  const engine = new EventEngine([
    {
      id: "throws",
      handle() {
        throw new Error("boom");
      },
    },
  ]);

  const result = await engine.emit("test", "ok");

  assertEquals(result.blocked, false);
  assertEquals(result.records[0].error?.code, "event_handler_failed");
});
