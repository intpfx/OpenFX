import { expect } from "@std/expect";

const homepageCss = await Deno.readTextFile(
  new URL("../src/styles.css", import.meta.url),
);

function cssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = homepageCss.match(
    new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]+)\\}`),
  );
  expect(match, `missing CSS rule: ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

Deno.test("desktop footer is one structural three-column rail", () => {
  const dock = cssRule(".homepage-footer-dock");

  expect(dock).toContain("display: grid");
  expect(dock).toContain("grid-template-columns:");
  expect(dock).toContain("grid-column: 1 / -1");
  expect(dock).toContain("grid-row: 3");
  expect(dock).toContain("border: 1px solid");
  expect(dock).toContain("background:");
  expect(dock).toContain("box-shadow:");
  expect(dock).not.toContain("position: fixed");

  expect(cssRule(".homepage-footer-dock__middle")).toContain("min-width: 0");
  expect(cssRule(".homepage-footer-dock__right")).toContain("min-width: 0");
});

Deno.test("normal location status and progress participate in dock layout", () => {
  const status = cssRule(".homepage-location-status,\n.homepage-location-progress");

  expect(status).not.toContain("position: fixed");
  expect(status).not.toContain("left: 50%");
  expect(status).not.toContain("transform: translateX(-50%)");
  expect(status).not.toContain("border:");
  expect(status).not.toContain("background:");
  expect(status).not.toContain("box-shadow:");
  expect(homepageCss).not.toContain(":has(");
  expect(homepageCss).not.toContain("--homepage-footer-track-");
});

Deno.test("mobile dock remains one fixed shell with two internal rows", () => {
  const mobileStart = homepageCss.indexOf("@media (max-width: 900px)");
  const mobileEnd = homepageCss.indexOf("\n}", mobileStart);
  const mobileCss = homepageCss.slice(mobileStart, mobileEnd + 2);

  expect(mobileCss).toContain(`.homepage-footer-dock {
    position: fixed;`);
  expect(mobileCss).toContain(
    "grid-template-columns: minmax(7rem, 0.75fr) minmax(0, 1.25fr);",
  );
  expect(mobileCss).toContain(`.homepage-footer-dock__right {
    grid-column: 1 / -1;`);
  expect(mobileCss).toContain("grid-row: 2;");
});

Deno.test("mobile dock controls and attribution links retain a 44px touch target", () => {
  expect(homepageCss).toContain(`@media (max-width: 900px)`);
  expect(homepageCss).toContain(`.homepage-footer-dock button,
  .homepage-footer-dock input,
  .homepage-location-attribution,
  .homepage-location-gate-attribution,
  .homepage-poster-attribution {
    min-height: 44px;
  }`);
});

Deno.test("permission gate remains fixed above the dock and page", () => {
  const gate = cssRule(".homepage-location-gate");

  expect(gate).toContain("position: fixed");
  expect(gate).toContain("z-index: 80");
  expect(gate).toContain("height: 58px");
  expect(gate).toContain("bottom:");
});

Deno.test("ready city poster retains its road field and footer mask", () => {
  const poster = cssRule(".homepage-poster-background img");

  expect(poster).toContain("position: absolute");
  expect(poster).toContain("height: 120%");
  expect(poster).toContain("object-position: center top");
  expect(poster).toContain("mix-blend-mode: multiply");
  expect(poster).toContain("-webkit-mask-image: linear-gradient(");
  expect(poster).toContain("mask-image: linear-gradient(");
  expect(homepageCss).toContain(`.homepage-poster-background[data-ready="true"] img {
  opacity: 0.96;
}`);
});
