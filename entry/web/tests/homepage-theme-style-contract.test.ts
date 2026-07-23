import { expect } from "@std/expect";

const css = await Deno.readTextFile(
  new URL("../src/styles.css", import.meta.url),
);

Deno.test("homepage declares complete light and dark semantic tokens", () => {
  expect(css).toContain(':root,\n:root[data-theme="light"]');
  expect(css).toContain(':root[data-theme="dark"]');
  for (
    const token of [
      "--bg",
      "--surface",
      "--surface-raised",
      "--text-primary",
      "--text-secondary",
      "--accent",
      "--border",
      "--grid-line",
      "--dock-mobile-background",
      "--shadow-color",
      "--poster-overlay-start",
      "--poster-overlay-end",
    ]
  ) {
    expect(css.match(new RegExp(`${token}:`, "g"))?.length).toBeGreaterThanOrEqual(2);
  }
});

Deno.test("theme controls browser color scheme and poster treatment", () => {
  expect(css).toContain("color-scheme: light;");
  expect(css).toContain("color-scheme: dark;");
  expect(css).toContain(':root[data-theme="dark"] .homepage-poster-background img');
  expect(css).not.toContain("body {\n  color-scheme: light;");
});

Deno.test("owned surfaces use semantic theme values", () => {
  for (
    const selector of [
      ".project-card",
      ".domain-panel",
      ".homepage-location-gate",
      ".homepage-footer-dock",
    ]
  ) {
    expect(css).toContain(selector);
  }
  expect(css).toContain("background: var(--surface");
  expect(css).toContain("background: var(--dock-mobile-background)");
});
