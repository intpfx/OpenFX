import { expect } from "@std/expect";

import { HOMEPAGE_PROJECTS } from "../homepage-projects.ts";
import { PROJECT_DETAIL_PANEL_IDS } from "../homepage-panels.ts";

Deno.test("homepage project cards all have detail panels", () => {
  const projectCardIds = HOMEPAGE_PROJECTS.columns.flatMap((column) =>
    column.cards.map((card) => card.id)
  );
  const detailPanelIds = new Set<string>(PROJECT_DETAIL_PANEL_IDS);

  expect(new Set(projectCardIds).size).toBe(projectCardIds.length);
  expect(projectCardIds.filter((id) => !detailPanelIds.has(id))).toEqual([]);
});

Deno.test("homepage data panel is opened from the OpenFX logo", () => {
  const projectCardIds = HOMEPAGE_PROJECTS.columns.flatMap((column) =>
    column.cards.map((card) => card.id)
  );

  expect(projectCardIds).not.toContain("openfx-data");
  expect(PROJECT_DETAIL_PANEL_IDS).toContain("openfx-data");
});

Deno.test("homepage project cards are visible by default", () => {
  const hiddenCards = HOMEPAGE_PROJECTS.columns.flatMap((column) =>
    column.cards.filter((card) => card.hidden)
  );

  expect(hiddenCards).toEqual([]);
});
