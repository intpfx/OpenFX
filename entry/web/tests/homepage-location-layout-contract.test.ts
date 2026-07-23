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

Deno.test("desktop footer is an editorial two-baseline rail", () => {
  const dock = cssRule(".homepage-footer-dock");

  expect(dock).toContain("display: grid");
  expect(dock).toContain("grid-template-columns: minmax(0, 1fr) auto");
  expect(dock).toContain("grid-template-rows:");
  expect(dock).toContain("grid-column: 1 / -1");
  expect(dock).toContain("grid-row: 3");
  expect(dock).toContain("border-bottom:");
  expect(dock).toContain("background: transparent");
  expect(dock).not.toContain("border: 1px solid");
  expect(dock).not.toContain("border-radius:");
  expect(dock).not.toContain("backdrop-filter:");
  expect(dock).not.toContain("box-shadow:");
  expect(dock).not.toContain("position: fixed");

  expect(cssRule(".homepage-footer-dock__meta")).toContain("grid-row: 1");
  expect(cssRule(".homepage-footer-dock__index")).toContain("grid-row: 2");
  expect(cssRule(".homepage-footer-dock__action")).toContain("grid-row: 1 / 3");
});

Deno.test("desktop Proxy index stays within the editorial second baseline", () => {
  expect(cssRule(".proxy-footer-form")).toContain("min-height: 32px");
  expect(cssRule(".proxy-footer-input")).toContain("min-height: 32px");
  expect(cssRule(".proxy-footer-input:focus")).toContain(
    "box-shadow: inset 0 -1px 0 var(--accent)",
  );
});

Deno.test("message state changes do not animate Dock content into place", () => {
  expect(cssRule(".message-inline-form")).not.toContain("animation:");
  expect(homepageCss).not.toContain("@keyframes message-compose-in");
  expect(homepageCss).not.toContain("translateY(5px)");
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
  expect(mobileCss).toContain("grid-template-columns: minmax(0, 1fr) auto;");
  expect(mobileCss).toContain("grid-template-rows: 44px 44px;");
  expect(mobileCss).toContain("min-height: 88px;");
  expect(mobileCss).toContain("background: var(--dock-mobile-background);");
  expect(mobileCss).toContain(`.homepage-footer-dock__action {
    min-width: 5.8rem;`);
  expect(mobileCss).toContain(`.proxy-footer-form {
    min-height: 44px;`);
  expect(mobileCss).toContain(`.homepage-theme-control-label,
  .homepage-theme-control-separator,
  .build-version .footer-eyebrow,
  .homepage-location-label {
    display: none;`);
  expect(homepageCss).toContain(".homepage-theme-control-value");
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
