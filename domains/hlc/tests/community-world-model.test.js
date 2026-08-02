import {
  clampWorldCamera,
  clampWorldCameraToRect,
  clampWorldZoom,
  createFocusAreaGeoJson,
  focusAreaGeoJsonToWorldPoints,
  getVisibleWorldChunks,
  getWorldChunkId,
  getWorldLod,
  projectGeographicPoint,
  unprojectWorldPoint,
  viewportToWorldPoint,
  worldToViewportPoint,
  YONGCHANG_WORLD,
} from "../source/community-world-model.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const assertNear = (actual, expected, tolerance, message) => {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, got ${actual}`,
  );
};

Deno.test("projects WGS84 coordinates into the Yongchang world and back", () => {
  const source = { longitude: 104.4166911, latitude: 31.6450428 };
  const projected = projectGeographicPoint(source);
  const restored = unprojectWorldPoint(projected);

  assert(
    projected.x > 0 && projected.x < YONGCHANG_WORLD.width,
    "x is inside world",
  );
  assert(
    projected.y > 0 && projected.y < YONGCHANG_WORLD.height,
    "y is inside world",
  );
  assertNear(
    restored.longitude,
    source.longitude,
    1e-7,
    "longitude round trips",
  );
  assertNear(restored.latitude, source.latitude, 1e-7, "latitude round trips");

  const east = projectGeographicPoint({
    ...source,
    longitude: source.longitude + 0.001,
  });
  const north = projectGeographicPoint({
    ...source,
    latitude: source.latitude + 0.001,
  });
  assert(east.x > projected.x, "east increases world x");
  assert(north.y < projected.y, "north decreases world y");
});

Deno.test("focus-area export creates a versioned non-administrative GeoJSON polygon", () => {
  const points = [
    projectGeographicPoint({ longitude: 104.412, latitude: 31.648 }),
    projectGeographicPoint({ longitude: 104.421, latitude: 31.648 }),
    projectGeographicPoint({ longitude: 104.422, latitude: 31.641 }),
    projectGeographicPoint({ longitude: 104.413, latitude: 31.639 }),
  ];
  const feature = createFocusAreaGeoJson(points, {
    draftedBy: "社区校核员",
    draftedAt: "2026-08-02T08:00:00.000Z",
    version: 3,
  });
  const ring = feature.geometry.coordinates[0];

  assert(feature.type === "Feature", "exports a GeoJSON feature");
  assert(feature.geometry.type === "Polygon", "exports a polygon");
  assert(ring.length === points.length + 1, "polygon ring is closed");
  assert(
    ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1],
    "first point closes ring",
  );
  assert(feature.properties.version === 3, "version is preserved");
  assert(feature.properties.draftedBy === "社区校核员", "drafter is preserved");
  assert(
    feature.properties.administrativeBoundary === false,
    "scope is not an administrative boundary",
  );
  assert(
    feature.properties.boundaryKind === "product-focus-area",
    "scope purpose is explicit",
  );

  const restored = focusAreaGeoJsonToWorldPoints(feature);
  assert(
    restored.length === points.length,
    "closed coordinate is removed when restoring draft points",
  );
  assertNear(
    restored[2].x,
    points[2].x,
    0.02,
    "focus area world x round trips",
  );
  assertNear(
    restored[2].y,
    points[2].y,
    0.02,
    "focus area world y round trips",
  );
});

Deno.test("LOD and chunk selection expose only the visible part of the world", () => {
  assert(getWorldLod(1.1) === "context", "overview uses context LOD");
  assert(getWorldLod(1.6) === "town", "middle zoom uses town LOD");
  assert(
    getWorldLod(2.6) === "town",
    "old-town zoom does not expose focus-area details too early",
  );
  assert(getWorldLod(4.6) === "detail", "close zoom uses detail LOD");

  const viewport = { width: 390, height: 740 };
  const center = projectGeographicPoint(YONGCHANG_WORLD.center);
  const camera = clampWorldCamera({
    centerX: center.x,
    centerY: center.y,
    zoom: 3.2,
  }, viewport);
  const visible = getVisibleWorldChunks(camera, viewport, { overscan: 0 });
  const total = Math.ceil(YONGCHANG_WORLD.width / YONGCHANG_WORLD.chunkSize) *
    Math.ceil(YONGCHANG_WORLD.height / YONGCHANG_WORLD.chunkSize);

  assert(visible.length > 0, "at least one chunk is visible");
  assert(visible.length < total, "close view does not select the entire world");
  assert(
    visible.includes(getWorldChunkId(center)),
    "center chunk remains visible",
  );
});

Deno.test("camera transforms round trip and clamp panning to the modeled world", () => {
  const viewport = { width: 1280, height: 720 };
  const camera = clampWorldCamera({
    centerX: -50_000,
    centerY: 50_000,
    zoom: 2.4,
  }, viewport);

  assert(camera.centerX >= 0, "camera cannot pan beyond west edge");
  assert(
    camera.centerY <= YONGCHANG_WORLD.height,
    "camera cannot pan beyond south edge",
  );
  assert(camera.scale > 0, "camera exposes a usable scale");

  const source = {
    x: YONGCHANG_WORLD.width * 0.72,
    y: YONGCHANG_WORLD.height * 0.34,
  };
  const screen = worldToViewportPoint(source, camera, viewport);
  const restored = viewportToWorldPoint(screen, camera, viewport);
  assertNear(
    restored.x,
    source.x,
    1e-6,
    "world x round trips through viewport",
  );
  assertNear(
    restored.y,
    source.y,
    1e-6,
    "world y round trips through viewport",
  );
});

Deno.test("semantic detail zoom supports portrait screens without unbounded scaling", () => {
  assert(clampWorldZoom(28.18) === 28.18, "portrait detail zoom is preserved");
  assert(
    clampWorldZoom(80) === 64,
    "zoom remains capped at the art-layer limit",
  );
});

Deno.test("detail camera cannot expose the edge of its art rectangle", () => {
  const viewport = { width: 1280, height: 720 };
  const camera = clampWorldCamera({
    centerX: 50_000,
    centerY: -50_000,
    zoom: 14,
  }, viewport);
  const rect = { x: 2_300, y: 2_100, width: 790, height: 445 };
  const clamped = clampWorldCameraToRect(camera, viewport, rect);
  const halfWidth = viewport.width / (clamped.scale * 2);
  const halfHeight = viewport.height / (clamped.scale * 2);

  assert(
    clamped.centerX - halfWidth >= rect.x,
    "camera stays inside the detail art west edge",
  );
  assert(
    clamped.centerX + halfWidth <= rect.x + rect.width,
    "camera stays inside the detail art east edge",
  );
  assert(
    clamped.centerY - halfHeight >= rect.y,
    "camera stays inside the detail art north edge",
  );
  assert(
    clamped.centerY + halfHeight <= rect.y + rect.height,
    "camera stays inside the detail art south edge",
  );
});

Deno.test("overview camera keeps a wide viewport inside the hand-drawn art", () => {
  const viewport = { width: 1948, height: 876 };
  const rect = { x: 0, y: 210, width: 1606, height: 979 };
  const coverScale = Math.max(
    viewport.width / rect.width,
    viewport.height / rect.height,
  ) * 1.06;
  const clamped = clampWorldCameraToRect(
    {
      centerX: -8_000,
      centerY: 12_000,
      zoom: 1,
      scale: coverScale,
    },
    viewport,
    rect,
  );
  const halfWidth = viewport.width / (clamped.scale * 2);
  const halfHeight = viewport.height / (clamped.scale * 2);

  assert(
    clamped.centerX - halfWidth >= rect.x,
    "wide overview stays inside the west art edge",
  );
  assert(
    clamped.centerX + halfWidth <= rect.x + rect.width,
    "wide overview stays inside the east art edge",
  );
  assert(
    clamped.centerY - halfHeight >= rect.y,
    "wide overview stays inside the north art edge",
  );
  assert(
    clamped.centerY + halfHeight <= rect.y + rect.height,
    "wide overview stays inside the south art edge",
  );
});
