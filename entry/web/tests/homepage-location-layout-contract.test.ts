import { expect } from "@std/expect";

const homepageCss = await Deno.readTextFile(
  new URL("../src/styles.css", import.meta.url),
);

Deno.test("location permission gate has an exact 58px outer height", () => {
  expect(homepageCss).toContain(`.homepage-location-gate {
  bottom: max(1.35rem, env(safe-area-inset-bottom));
  width: min(760px, calc(100vw - 68px));
  height: 58px;
  gap: 0.6rem;
  padding: 6px 8px 6px 20px;
}`);

  expect(homepageCss).toContain(`.homepage-location-primary,
.homepage-location-dismiss,
.homepage-location-status button {
  flex: 0 0 auto;
  min-height: 44px;`);
});

Deno.test("compact location states clear the command bar at intermediate widths", () => {
  expect(homepageCss).toContain(`@media (max-width: 1100px) {
  .homepage-location-status,
  .homepage-location-progress {
    bottom: calc(max(1.4rem, env(safe-area-inset-bottom)) + 3.5rem);
  }`);
});

Deno.test("desktop location status reserves space between footer controls", () => {
  expect(homepageCss).toContain(`@media (min-width: 1100.02px) {
  .homepage-page:has(.homepage-location-status) .control-hint,
  .homepage-page:has(.homepage-location-progress) .control-hint {
    width: min(18rem, 100%);
  }`);
});

Deno.test("ready city poster keeps its footer outside the homepage composition", () => {
  expect(homepageCss).toContain(`.homepage-poster-background img {
  position: absolute;
  z-index: 1;
  top: 0;
  width: 100%;
  height: 120%;`);
  expect(homepageCss).toContain("object-position: center top;");
  expect(homepageCss).toContain(`.homepage-poster-background[data-ready="true"] img {
  opacity: 0.78;
}`);
});
