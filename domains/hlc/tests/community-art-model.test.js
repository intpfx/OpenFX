import assert from "node:assert/strict";
import {
  createSceneArtRects,
  getSceneArtNativeScale,
  getSceneArtZoom,
  SCENE_ART_LAYERS,
  SCENE_PLACE_ART_IDS,
} from "../source/community-art-model.js";
import { YONGCHANG_WORLD } from "../source/community-world-model.js";

const focusCenter = Object.freeze({ x: 2_980, y: 2_470 });

Deno.test("all seven places are higher-density children of the ShengDeng detail layer", () => {
  const rects = createSceneArtRects(YONGCHANG_WORLD, focusCenter);
  const detail = rects.detail;
  assert.deepEqual(SCENE_PLACE_ART_IDS, [
    "service-center",
    "public-square",
    "learning-room",
    "tool-house",
    "tea-courtyard",
    "skills-workshop",
    "riverside-volunteers",
  ]);

  for (const placeId of SCENE_PLACE_ART_IDS) {
    const place = rects[placeId];
    assert.ok(place.x >= detail.x, `${placeId} starts inside detail`);
    assert.ok(place.y >= detail.y, `${placeId} starts inside detail`);
    assert.ok(
      place.x + place.width <= detail.x + detail.width,
      `${placeId} ends inside detail`,
    );
    assert.ok(
      place.y + place.height <= detail.y + detail.height,
      `${placeId} bottom edge stays inside detail`,
    );
    assert.ok(
      Math.abs(
        place.width / place.height -
          SCENE_ART_LAYERS[placeId].naturalWidth /
            SCENE_ART_LAYERS[placeId].naturalHeight,
      ) < 0.000_001,
      `${placeId} keeps the source aspect ratio`,
    );
    assert.ok(
      getSceneArtNativeScale(placeId, rects) >
        getSceneArtNativeScale("detail", rects) * 1.7,
      `${placeId} has enough native density for its deeper zoom`,
    );
  }
});

Deno.test("all seven place arts request a deeper semantic zoom on desktop and portrait screens", () => {
  const rects = createSceneArtRects(YONGCHANG_WORLD, focusCenter);

  for (
    const sample of [
      { viewport: { width: 1_225, height: 762 }, baseScale: 0.1311 },
      { viewport: { width: 390, height: 844 }, baseScale: 0.06735 },
    ]
  ) {
    const detailZoom = getSceneArtZoom(
      "detail",
      sample.viewport,
      rects,
      sample.baseScale,
    );
    for (const placeId of SCENE_PLACE_ART_IDS) {
      const placeZoom = getSceneArtZoom(
        placeId,
        sample.viewport,
        rects,
        sample.baseScale,
      );
      assert.ok(placeZoom > detailZoom, `${placeId} zooms beyond detail`);
      assert.ok(placeZoom <= 64, `${placeId} respects the zoom ceiling`);
    }
  }
});
