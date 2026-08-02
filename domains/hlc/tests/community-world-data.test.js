import { YONGCHANG_SCENE_DATA } from "../source/data/yongchang-scene-data.js";
import { prepareWorldFeatures } from "../source/community-world-renderer.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

Deno.test("Yongchang scene ships an attributed offline vector snapshot", () => {
  assert(
    YONGCHANG_SCENE_DATA.type === "OpenFXCommunityWorld",
    "snapshot type is explicit",
  );
  assert(
    YONGCHANG_SCENE_DATA.metadata.coordinateSystem === "WGS84",
    "snapshot uses WGS84",
  );
  assert(
    YONGCHANG_SCENE_DATA.metadata.attribution.includes("OpenStreetMap"),
    "OSM attribution is preserved",
  );
  assert(
    YONGCHANG_SCENE_DATA.features.length >= 100,
    "old-town skeleton has useful coverage",
  );

  const kinds = new Set(YONGCHANG_SCENE_DATA.features.map(({ kind }) => kind));
  assert(kinds.has("road"), "snapshot includes roads");
  assert(
    kinds.has("waterway") || kinds.has("water"),
    "snapshot includes water geometry",
  );
  assert(kinds.has("land"), "snapshot includes contextual land geometry");

  for (const feature of YONGCHANG_SCENE_DATA.features) {
    assert(
      feature.coordinates.length >= 2,
      `${feature.id} has a drawable geometry`,
    );
    assert(
      ["context", "town", "detail"].includes(feature.lod),
      `${feature.id} has an LOD`,
    );
    for (const [longitude, latitude] of feature.coordinates) {
      assert(
        Number.isFinite(longitude) && Number.isFinite(latitude),
        `${feature.id} has finite coordinates`,
      );
    }
  }
});

Deno.test("scene features become projected SVG paths with chunk coverage", () => {
  const prepared = prepareWorldFeatures(YONGCHANG_SCENE_DATA.features);
  const namedRoad = prepared.find(({ name }) => name === "安州大道西段");

  assert(
    prepared.length === YONGCHANG_SCENE_DATA.features.length,
    "all source features are prepared",
  );
  assert(namedRoad, "known old-town road survives preparation");
  assert(namedRoad.path.startsWith("M"), "road becomes an SVG path");
  assert(!namedRoad.path.includes("NaN"), "path coordinates remain finite");
  assert(namedRoad.chunks.length > 0, "road is assigned to chunks");
});
