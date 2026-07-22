import { expect } from "@std/expect";

import type { HomepageProjectCard } from "../homepage-projects.ts";
import {
  getProjectSearchText,
  shouldAnimateHomepageCards,
  shouldUseHomepageViewTransition,
} from "../src/homepage/experience.ts";

const PROJECT: HomepageProjectCard = {
  id: "map-poster",
  type: "project",
  name: "Map Poster",
  description: "从 OpenStreetMap 数据生成地图海报。",
  tech: ["Bun", "OSM", "SVG"],
  sourcePath: "domains/map-poster/",
};

Deno.test("homepage search text includes the visible project fields", () => {
  expect(getProjectSearchText(PROJECT)).toBe(
    "map poster 从 openstreetmap 数据生成地图海报。 domains/map-poster/ bun osm svg",
  );
});

Deno.test("homepage card motion is desktop only and honors reduced motion", () => {
  expect(
    shouldAnimateHomepageCards({ reducedMotion: false, narrowViewport: false }),
  ).toBe(true);
  expect(
    shouldAnimateHomepageCards({ reducedMotion: true, narrowViewport: false }),
  ).toBe(false);
  expect(
    shouldAnimateHomepageCards({ reducedMotion: false, narrowViewport: true }),
  ).toBe(false);
});

Deno.test("homepage view transitions require availability, visibility, and motion", () => {
  expect(
    shouldUseHomepageViewTransition({
      available: true,
      narrowViewport: false,
      reducedMotion: false,
      visibility: "visible",
    }),
  ).toBe(true);
  expect(
    shouldUseHomepageViewTransition({
      available: false,
      narrowViewport: false,
      reducedMotion: false,
      visibility: "visible",
    }),
  ).toBe(false);
  expect(
    shouldUseHomepageViewTransition({
      available: true,
      narrowViewport: false,
      reducedMotion: true,
      visibility: "visible",
    }),
  ).toBe(false);
  expect(
    shouldUseHomepageViewTransition({
      available: true,
      narrowViewport: false,
      reducedMotion: false,
      visibility: "hidden",
    }),
  ).toBe(false);
  expect(
    shouldUseHomepageViewTransition({
      available: true,
      reducedMotion: false,
      visibility: "visible",
      narrowViewport: true,
    }),
  ).toBe(false);
});
