import { expect } from "@std/expect";

import { HOMEPAGE_PROJECTS } from "../homepage-projects.ts";
import { PROJECT_DETAIL_PANEL_IDS } from "../homepage-panels.ts";

Deno.test("homepage project cards all have detail panels", () => {
  const projectCardIds = HOMEPAGE_PROJECTS.columns.flatMap((column) =>
    column.cards.map((card) => card.id)
  );
  const detailPanelIds = [...PROJECT_DETAIL_PANEL_IDS];

  expect(new Set(projectCardIds).size).toBe(projectCardIds.length);
  expect([...projectCardIds].sort()).toEqual(detailPanelIds.sort());
});
