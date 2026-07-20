import { expect } from "@std/expect";

import { HOMEPAGE_PROJECTS } from "../homepage-projects.ts";
import { PROJECT_DETAIL_PANEL_IDS, resolveHomepageRoute } from "../homepage-panels.ts";
import { redirectLegacyAdminRequest } from "../server/routes/admin.get.ts";

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

Deno.test("legacy admin URL opens the root homepage data console", () => {
  expect(resolveHomepageRoute("/admin")).toEqual({
    canonicalPath: "/",
    initialPanel: "openfx-data",
  });
});

Deno.test("legacy admin HTTP route redirects to the root homepage", () => {
  const response = redirectLegacyAdminRequest();

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/");
});

Deno.test("homepage project cards are visible by default", () => {
  const hiddenCards = HOMEPAGE_PROJECTS.columns.flatMap((column) =>
    column.cards.filter((card) => card.hidden)
  );

  expect(hiddenCards).toEqual([]);
});
