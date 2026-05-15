import { assertEquals } from "jsr:@std/assert";

import { createCounterState, decrementCounter, incrementCounter } from "../src/mod.ts";

Deno.test("incrementCounter returns a new incremented state", () => {
  assertEquals(incrementCounter(createCounterState(1)), { value: 2 });
});

Deno.test("decrementCounter returns a new decremented state", () => {
  assertEquals(decrementCounter(createCounterState(1)), { value: 0 });
});
