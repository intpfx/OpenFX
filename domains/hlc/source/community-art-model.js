const artLayer = (definition) =>
  Object.freeze({
    ...definition,
    placement: definition.placement
      ? Object.freeze({ ...definition.placement })
      : null,
  });

export const SCENE_ART_LAYERS = Object.freeze({
  overview: artLayer({
    id: "overview",
    naturalWidth: 1606,
    naturalHeight: 979,
    worldWidth: "world",
  }),
  detail: artLayer({
    id: "detail",
    naturalWidth: 1672,
    naturalHeight: 941,
    worldWidth: 790,
  }),
  "service-center": artLayer({
    id: "service-center",
    naturalWidth: 1672,
    naturalHeight: 941,
    parentId: "detail",
    placement: {
      x: 0.1,
      y: 0.025,
      width: 0.57,
    },
  }),
  "public-square": artLayer({
    id: "public-square",
    naturalWidth: 1672,
    naturalHeight: 941,
    parentId: "detail",
    placement: { x: 0.214, y: 0.272, width: 0.52 },
  }),
  "learning-room": artLayer({
    id: "learning-room",
    naturalWidth: 1672,
    naturalHeight: 941,
    parentId: "detail",
    placement: { x: 0.089, y: 0.264, width: 0.42 },
  }),
  "tool-house": artLayer({
    id: "tool-house",
    naturalWidth: 1672,
    naturalHeight: 941,
    parentId: "detail",
    placement: { x: 0.53, y: 0.36, width: 0.47 },
  }),
  "tea-courtyard": artLayer({
    id: "tea-courtyard",
    naturalWidth: 1672,
    naturalHeight: 941,
    parentId: "detail",
    placement: { x: 0.33, y: 0.425, width: 0.5 },
  }),
  "skills-workshop": artLayer({
    id: "skills-workshop",
    naturalWidth: 1672,
    naturalHeight: 941,
    parentId: "detail",
    placement: { x: 0.466, y: 0.063, width: 0.48 },
  }),
  "riverside-volunteers": artLayer({
    id: "riverside-volunteers",
    naturalWidth: 1672,
    naturalHeight: 941,
    parentId: "detail",
    placement: { x: 0.155, y: 0.517, width: 0.46 },
  }),
});

export const SCENE_PLACE_ART_IDS = Object.freeze([
  "service-center",
  "public-square",
  "learning-room",
  "tool-house",
  "tea-courtyard",
  "skills-workshop",
  "riverside-volunteers",
]);

const SCENE_PLACE_ART_ID_SET = new Set(SCENE_PLACE_ART_IDS);

export const isScenePlaceArtLod = (lod) => SCENE_PLACE_ART_ID_SET.has(lod);

const artHeight = (layer, width) =>
  width * layer.naturalHeight / layer.naturalWidth;

export function createSceneArtRects(world, focusCenter) {
  const overview = Object.freeze({
    x: 0,
    y: (world.height - artHeight(SCENE_ART_LAYERS.overview, world.width)) / 2,
    width: world.width,
    height: artHeight(SCENE_ART_LAYERS.overview, world.width),
  });
  const detail = Object.freeze({
    x: focusCenter.x - SCENE_ART_LAYERS.detail.worldWidth / 2,
    y: focusCenter.y -
      artHeight(
          SCENE_ART_LAYERS.detail,
          SCENE_ART_LAYERS.detail.worldWidth,
        ) / 2,
    width: SCENE_ART_LAYERS.detail.worldWidth,
    height: artHeight(
      SCENE_ART_LAYERS.detail,
      SCENE_ART_LAYERS.detail.worldWidth,
    ),
  });
  const places = Object.fromEntries(SCENE_PLACE_ART_IDS.map((placeId) => {
    const layer = SCENE_ART_LAYERS[placeId];
    const width = detail.width * layer.placement.width;
    return [
      placeId,
      Object.freeze({
        x: detail.x + detail.width * layer.placement.x,
        y: detail.y + detail.height * layer.placement.y,
        width,
        height: artHeight(layer, width),
      }),
    ];
  }));

  return Object.freeze({
    overview,
    detail,
    ...places,
  });
}

export function getSceneArtNativeScale(lod, rects) {
  const layer = SCENE_ART_LAYERS[lod];
  const rect = rects[lod];
  if (!layer || !rect) throw new TypeError(`Unknown scene art LOD: ${lod}`);
  return Math.min(
    layer.naturalWidth / rect.width,
    layer.naturalHeight / rect.height,
  );
}

export function getSceneArtZoom(lod, viewport, rects, baseScale) {
  const rect = rects[lod];
  if (!rect) throw new TypeError(`Unknown scene art LOD: ${lod}`);
  const width = Math.max(1, Number(viewport?.width) || 1);
  const height = Math.max(1, Number(viewport?.height) || 1);
  const normalizedBaseScale = Math.max(0.000_001, Number(baseScale) || 0);
  const coverScale = Math.max(width / rect.width, height / rect.height) * 1.06;
  const targetScale = lod === "overview"
    ? coverScale
    : Math.min(coverScale, getSceneArtNativeScale(lod, rects) * 0.98);
  return Math.min(64, Math.max(1, targetScale / normalizedBaseScale));
}
