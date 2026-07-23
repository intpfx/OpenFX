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

Deno.test("tablet location states clear the command bar", () => {
  expect(homepageCss).toContain(`@media (max-width: 1100px) {
  .homepage-location-status,
  .homepage-location-progress {
    bottom: calc(max(1.4rem, env(safe-area-inset-bottom)) + 3.5rem);
  }`);
});

Deno.test("mobile location states collapse the empty hint and clear the two-row footer", () => {
  expect(homepageCss).toContain(
    `.homepage-page:has(.homepage-location-status) .control-hint[data-active="false"]:empty,
  .homepage-page:has(.homepage-location-progress) .control-hint[data-active="false"]:empty {
    display: none;
  }`,
  );
  expect(homepageCss).not.toContain(
    `.homepage-page:has(.homepage-location-status) .control-hint,
  .homepage-page:has(.homepage-location-progress) .control-hint {
    display: none;
  }`,
  );
  expect(homepageCss).toContain(
    `.homepage-page:has(.control-hint:not(:empty)) .homepage-location-status,
  .homepage-page:has(.control-hint:not(:empty)) .homepage-location-progress {
    bottom: calc(max(0.72rem, env(safe-area-inset-bottom)) + 10.25rem);
  }`,
  );

  // The non-empty selector also covers data-active="false" while the old aria-live
  // text scrambles out; only the final inactive+empty state returns to 7.5rem.
  expect(homepageCss).toContain(`.homepage-location-status,
  .homepage-location-progress {
    bottom: calc(max(0.72rem, env(safe-area-inset-bottom)) + 7.5rem);
    max-width: calc(100vw - 2rem);
  }`);
});

Deno.test("desktop location status reserves space between footer controls", () => {
  expect(homepageCss).toContain(
    `.homepage-page:has(.homepage-location-status) .control-hint,
  .homepage-page:has(.homepage-location-progress) .control-hint {
    width: min(18rem, 100%);
  }`,
  );
});

Deno.test("desktop footer centers its version, location status, and command bar on one track", () => {
  expect(homepageCss).toContain(`.homepage-page {
    --homepage-footer-track-bottom: max(1.4rem, env(safe-area-inset-bottom));
    --homepage-footer-track-height: 42px;
    padding-bottom: var(--homepage-footer-track-bottom);
  }

  .control-cluster,
  .control-status,
  .build-version,
  .project-command-bar {
    min-height: var(--homepage-footer-track-height);
  }
`);

  expect(homepageCss).toContain(`.control-status,
  .build-version,
  .project-command-bar {
    height: var(--homepage-footer-track-height);
  }`);

  expect(homepageCss).toContain(`.homepage-location-status,
  .homepage-location-progress {
    bottom: var(--homepage-footer-track-bottom);
    height: var(--homepage-footer-track-height);
    min-height: var(--homepage-footer-track-height);
  }`);
});

Deno.test("poster attribution remains above the ready controls at tablet and mobile widths", () => {
  expect(homepageCss).toContain(`.homepage-location-attribution {
  flex: 0 0 auto;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.54rem;`);
  expect(homepageCss).toContain(`.homepage-location-status strong {
  min-width: 0;
  overflow: hidden;
  color: var(--accent);
  text-overflow: ellipsis;
  white-space: nowrap;
}`);
  expect(homepageCss).toContain(`.homepage-location-status:not(.is-error) > span {
    display: none;
  }

  .homepage-location-status:not(.is-error) strong {
    flex: 1 1 auto;
    min-width: 5.5rem;
  }`);
  expect(homepageCss).toContain(
    `.homepage-location-capsule.homepage-location-gate .homepage-location-gate-attribution {
  position: absolute;
  bottom: calc(100% + 0.55rem);
}`,
  );
  expect(homepageCss).toContain(`.homepage-poster-attribution {
    bottom: calc(max(1.4rem, env(safe-area-inset-bottom)) + 6.8rem);
  }`);
  expect(homepageCss).toContain(`.homepage-poster-attribution {
    bottom: calc(max(0.72rem, env(safe-area-inset-bottom)) + 11.6rem);
    font-size: 0.5rem;
  }`);
  expect(homepageCss).toContain(
    `.homepage-page:has(.control-hint:not(:empty)) .homepage-poster-attribution {
    bottom: calc(max(0.72rem, env(safe-area-inset-bottom)) + 14.5rem);
  }`,
  );
});

Deno.test("ready city poster uses a strong road field and masks its footer", () => {
  expect(homepageCss).toContain(`.homepage-poster-background img {
  position: absolute;
  z-index: 1;
  top: 0;
  width: 100%;
  height: 120%;`);
  expect(homepageCss).toContain("object-position: center top;");
  expect(homepageCss).toContain("mix-blend-mode: multiply;");
  expect(homepageCss).toContain(`-webkit-mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 65%,
    rgb(0 0 0 / 0.78) 69%,
    transparent 76%
  );`);
  expect(homepageCss).toContain(`mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 65%,
    rgb(0 0 0 / 0.78) 69%,
    transparent 76%
  );`);
  expect(homepageCss).toContain(
    "linear-gradient(oklch(0.74 0.008 250 / 0.035) 1px, transparent 1px)",
  );
  expect(homepageCss).toContain(`.homepage-poster-background[data-ready="true"] img {
  opacity: 0.96;
}`);
});
