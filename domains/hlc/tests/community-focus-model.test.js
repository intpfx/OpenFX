import { SHENGDENG_FOCUS_AREA } from "../source/data/shengdeng-focus-area.js";
import { YONGCHANG_SCENE_DATA } from "../source/data/yongchang-scene-data.js";
import {
  createFocusDistrict,
  isWorldPointInPolygon,
  positionInFocusArea,
} from "../source/community-focus-model.js";
import { SCENE_PLACES } from "../source/community-map-model.js";
import { prepareWorldFeatures } from "../source/community-world-renderer.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

Deno.test("the user-drawn ShengDeng focus area is the versioned project default", () => {
  const feature = SHENGDENG_FOCUS_AREA;
  const ring = feature.geometry.coordinates[0];

  assert(feature.type === "Feature", "focus area is a GeoJSON feature");
  assert(feature.geometry.type === "Polygon", "focus area is a polygon");
  assert(feature.properties.version === 1, "initial scope is version 1");
  assert(
    feature.properties.boundaryKind === "product-focus-area",
    "scope is a product focus area",
  );
  assert(
    feature.properties.administrativeBoundary === false,
    "scope does not claim to be an administrative boundary",
  );
  assert(ring.length === 5, "four user-drawn nodes form a closed ring");
  assert(
    ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1],
    "focus-area ring is closed",
  );
});

Deno.test("high-detail art assets are deterministic and stay inside the focus area", () => {
  const prepared = prepareWorldFeatures(YONGCHANG_SCENE_DATA.features);
  const first = createFocusDistrict(SHENGDENG_FOCUS_AREA, prepared);
  const second = createFocusDistrict(SHENGDENG_FOCUS_AREA, prepared);

  assert(first.assets.length >= 12, "focus area gains a useful art layer");
  assert(first.assets.length <= 48, "art layer keeps a restrained density");
  assert(
    first.assets.map(({ id }) => id).join(",") ===
      second.assets.map(({ id }) => id).join(","),
    "asset generation is deterministic",
  );
  for (const asset of first.assets) {
    assert(
      asset.footprint.every((point) =>
        isWorldPointInPolygon(point, first.points)
      ),
      `${asset.id} stays inside the approved focus area`,
    );
    assert(
      asset.kind === "building" || asset.kind === "courtyard",
      `${asset.id} uses an abstract art asset kind`,
    );
  }
});

Deno.test("content-place anchors are arranged inside the initial focus area", () => {
  const prepared = prepareWorldFeatures(YONGCHANG_SCENE_DATA.features);
  const district = createFocusDistrict(SHENGDENG_FOCUS_AREA, prepared);
  const positioned = SCENE_PLACES.map((place) => ({
    id: place.id,
    point: positionInFocusArea(district, place.focusPosition),
  }));

  for (const { id, point } of positioned) {
    assert(
      isWorldPointInPolygon(point, district.points),
      `${id} is presented inside the ShengDeng focus area`,
    );
  }
  for (let index = 0; index < positioned.length; index += 1) {
    for (let other = index + 1; other < positioned.length; other += 1) {
      const left = positioned[index].point;
      const right = positioned[other].point;
      assert(
        Math.hypot(left.x - right.x, left.y - right.y) >= 45,
        `${positioned[index].id} and ${positioned[other].id} remain distinct`,
      );
    }
  }
});
