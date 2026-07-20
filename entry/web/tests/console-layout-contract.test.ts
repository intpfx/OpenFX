import { expect } from "@std/expect";

const consoleCss = await Deno.readTextFile(
  new URL("../src/console/console.css", import.meta.url),
);

Deno.test("embedded Console is sized and positioned by its homepage panel", () => {
  expect(consoleCss).toContain("height: 100%;");
  expect(consoleCss).toContain("min-height: 0;");
  expect(consoleCss).not.toContain("min-height: 100svh;");
  expect(consoleCss).not.toContain("position: fixed;");
  expect(consoleCss).not.toContain("100vw");
});
