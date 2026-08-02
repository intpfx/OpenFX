import { expect } from "@std/expect";

import { HOMEPAGE_PROJECTS } from "../homepage-projects.ts";
import { PROJECT_DETAIL_PANEL_IDS, resolveStandalonePage } from "../homepage-panels.ts";

const EXPECTED_PREVIEWS = new Map([
  ["how-much-this", "/homepage-previews/how-much.webp"],
  ["map-poster", "/map-poster/tokyo-japanese-ink.webp"],
  ["gasmap", "/homepage-previews/gasmap.webp"],
  ["finlyzer", "/homepage-previews/finlyzer.webp"],
]);

const homepageCards = HOMEPAGE_PROJECTS.columns.flatMap((column) => column.cards);

Deno.test("homepage project cards all have detail panels", () => {
  const projectCardIds = homepageCards.map((card) => card.id);
  const detailPanelIds = new Set<string>(PROJECT_DETAIL_PANEL_IDS);

  expect(projectCardIds).toHaveLength(14);
  expect(new Set(projectCardIds).size).toBe(projectCardIds.length);
  expect(projectCardIds.filter((id) => !detailPanelIds.has(id))).toEqual([]);
});

Deno.test("HLC opens a same-origin read-only showcase", async () => {
  const hlcCard = homepageCards.find((card) => card.id === "hlc");
  const appSource = await Deno.readTextFile(
    new URL("../src/App.tsx", import.meta.url),
  );

  expect(hlcCard).toBeDefined();
  expect(hlcCard?.name).toBe("HLC · 圣灯社区");
  expect(hlcCard?.sourcePath).toContain("domains/hlc/");
  expect(hlcCard?.sourcePath).toContain("same-origin read-only showcase");
  expect(hlcCard?.preview).toBeUndefined();
  expect(PROJECT_DETAIL_PANEL_IDS).toContain("hlc");
  expect(appSource).toContain('src="/hlc/"');
  expect(appSource).toContain('title="HLC · 圣灯社区只读展示"');
  expect(appSource).toContain('sandbox="allow-scripts allow-same-origin"');
});

Deno.test("homepage data panel is opened from the OpenFX logo", () => {
  const projectCardIds = homepageCards.map((card) => card.id);

  expect(projectCardIds).not.toContain("openfx-data");
  expect(PROJECT_DETAIL_PANEL_IDS).toContain("openfx-data");
});

Deno.test("admin is not a standalone page route", () => {
  expect(resolveStandalonePage("/admin")).toBeNull();
  expect(resolveStandalonePage("/downip")).toBe("downip");
});

Deno.test("homepage project cards are visible by default", () => {
  const hiddenCards = homepageCards.filter((card) => card.hidden);

  expect(hiddenCards).toEqual([]);
});

Deno.test("only the four approved homepage cards have local previews", () => {
  const previewCards = homepageCards.filter((card) => card.preview);

  expect(previewCards.map((card) => card.id).sort()).toEqual(
    [...EXPECTED_PREVIEWS.keys()].sort(),
  );

  for (const card of previewCards) {
    const preview = card.preview!;
    expect(preview.src).toBe(EXPECTED_PREVIEWS.get(card.id));
    expect(preview.src.startsWith("/")).toBe(true);
    expect(preview.src.startsWith("//")).toBe(false);
    expect(preview.alt.trim().length).toBeGreaterThan(0);
  }
});

Deno.test("homepage preview assets exist within their size budget", async () => {
  let totalBytes = 0;

  for (const [id, src] of EXPECTED_PREVIEWS) {
    const assetUrl = new URL(`../public${src}`, import.meta.url);
    const file = await Deno.stat(assetUrl);

    expect(file.isFile).toBe(true);
    expect(file.size, `${id} preview should not exceed 180 KiB`).toBeLessThanOrEqual(
      180 * 1024,
    );
    totalBytes += file.size;
  }

  expect(totalBytes).toBeLessThanOrEqual(700 * 1024);
  expect(EXPECTED_PREVIEWS.get("map-poster")).toBe(
    "/map-poster/tokyo-japanese-ink.webp",
  );
  expect(EXPECTED_PREVIEWS.values()).not.toContain(
    "/homepage-previews/map-poster.webp",
  );
});
