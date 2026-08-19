import { expect } from "@std/expect";

import { createInkSdf, renderInkSdf } from "../src/ink-sdf.ts";

Deno.test("an ink SDF changes thickness without rewriting the source mask", () => {
  const source = new Uint8Array(25);
  source[2 * 5 + 2] = 255;

  const sdf = createInkSdf({ width: 5, height: 5, coverage: source });
  const original = renderInkSdf(sdf, { thickness: 0, softness: 0 });
  const thickened = renderInkSdf(sdf, { thickness: 1.1, softness: 0 });

  expect(sdf.distance[2 * 5 + 2]).toBeLessThan(0);
  expect(sdf.distance[2 * 5 + 3]).toBeGreaterThan(0);
  expect(original.coverage[2 * 5 + 3]).toBe(0);
  expect(thickened.coverage[2 * 5 + 3]).toBe(255);
  expect(source).toEqual(
    new Uint8Array([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      255,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]),
  );
});
