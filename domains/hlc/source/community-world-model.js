const EARTH_RADIUS_METERS = 6_378_137;
const DEG_TO_RAD = Math.PI / 180;

const center = Object.freeze({
  longitude: 104.4166911,
  latitude: 31.6450428,
});

const geographicBounds = Object.freeze({
  west: 104.3889,
  east: 104.4445,
  north: 31.6688,
  south: 31.6213,
});

const longitudeScale = EARTH_RADIUS_METERS * DEG_TO_RAD *
  Math.cos(center.latitude * DEG_TO_RAD);
const latitudeScale = EARTH_RADIUS_METERS * DEG_TO_RAD;

const localMeters = ({ longitude, latitude }) =>
  Object.freeze({
    x: (Number(longitude) - center.longitude) * longitudeScale,
    y: (center.latitude - Number(latitude)) * latitudeScale,
  });

const northWest = localMeters({
  longitude: geographicBounds.west,
  latitude: geographicBounds.north,
});
const southEast = localMeters({
  longitude: geographicBounds.east,
  latitude: geographicBounds.south,
});

export const YONGCHANG_WORLD = Object.freeze({
  id: "yongchang-old-town",
  name: "永昌镇老城区",
  center,
  geographicBounds,
  width: southEast.x - northWest.x,
  height: southEast.y - northWest.y,
  chunkSize: 640,
  coordinateSystem: "WGS84",
});

export function projectGeographicPoint(point) {
  const local = localMeters(point);
  return Object.freeze({
    x: local.x - northWest.x,
    y: local.y - northWest.y,
  });
}

export function unprojectWorldPoint(point) {
  const localX = Number(point?.x) + northWest.x;
  const localY = Number(point?.y) + northWest.y;
  return Object.freeze({
    longitude: center.longitude + localX / longitudeScale,
    latitude: center.latitude - localY / latitudeScale,
  });
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function clampWorldZoom(value) {
  return Number.isFinite(value) ? clamp(value, 1, 64) : 1;
}

function viewportSize(viewport) {
  return Object.freeze({
    width: Math.max(1, Number(viewport?.width) || 1),
    height: Math.max(1, Number(viewport?.height) || 1),
  });
}

function worldBaseScale(viewport, options = {}) {
  const size = viewportSize(viewport);
  const padding = Math.max(
    0,
    Number(options.padding) || Math.min(size.width, size.height) * 0.045,
  );
  return Math.max(
    0.000_001,
    Math.min(
      Math.max(1, size.width - padding * 2) / YONGCHANG_WORLD.width,
      Math.max(1, size.height - padding * 2) / YONGCHANG_WORLD.height,
    ),
  );
}

export function clampWorldCamera(camera, viewport, options = {}) {
  const size = viewportSize(viewport);
  const zoom = clampWorldZoom(Number(camera?.zoom));
  const scale = worldBaseScale(size, options) * zoom;
  const halfWorldWidth = size.width / (scale * 2);
  const halfWorldHeight = size.height / (scale * 2);
  const midpointX = YONGCHANG_WORLD.width / 2;
  const midpointY = YONGCHANG_WORLD.height / 2;

  const centerX = halfWorldWidth * 2 >= YONGCHANG_WORLD.width
    ? midpointX
    : clamp(
      Number(camera?.centerX) || midpointX,
      halfWorldWidth,
      YONGCHANG_WORLD.width - halfWorldWidth,
    );
  const centerY = halfWorldHeight * 2 >= YONGCHANG_WORLD.height
    ? midpointY
    : clamp(
      Number(camera?.centerY) || midpointY,
      halfWorldHeight,
      YONGCHANG_WORLD.height - halfWorldHeight,
    );

  return Object.freeze({ centerX, centerY, zoom, scale });
}

export function clampWorldCameraToRect(camera, viewport, rect) {
  const size = viewportSize(viewport);
  const normalizedCamera = Number.isFinite(camera?.scale)
    ? camera
    : clampWorldCamera(camera, size);
  const width = Math.max(1, Number(rect?.width) || 1);
  const height = Math.max(1, Number(rect?.height) || 1);
  const x = Number(rect?.x) || 0;
  const y = Number(rect?.y) || 0;
  const halfWidth = size.width / (normalizedCamera.scale * 2);
  const halfHeight = size.height / (normalizedCamera.scale * 2);
  const minCenterX = x + halfWidth;
  const maxCenterX = x + width - halfWidth;
  const minCenterY = y + halfHeight;
  const maxCenterY = y + height - halfHeight;

  return Object.freeze({
    ...normalizedCamera,
    centerX: minCenterX > maxCenterX
      ? x + width / 2
      : clamp(normalizedCamera.centerX, minCenterX, maxCenterX),
    centerY: minCenterY > maxCenterY
      ? y + height / 2
      : clamp(normalizedCamera.centerY, minCenterY, maxCenterY),
  });
}

export function worldToViewportPoint(point, camera, viewport) {
  const size = viewportSize(viewport);
  return Object.freeze({
    x: size.width / 2 + (Number(point?.x) - camera.centerX) * camera.scale,
    y: size.height / 2 + (Number(point?.y) - camera.centerY) * camera.scale,
  });
}

export function viewportToWorldPoint(point, camera, viewport) {
  const size = viewportSize(viewport);
  return Object.freeze({
    x: camera.centerX + (Number(point?.x) - size.width / 2) / camera.scale,
    y: camera.centerY + (Number(point?.y) - size.height / 2) / camera.scale,
  });
}

export function getWorldLod(zoom) {
  const value = clampWorldZoom(Number(zoom));
  if (value < 1.35) return "context";
  if (value < 4.2) return "town";
  return "detail";
}

const chunkGrid = Object.freeze({
  columns: Math.ceil(YONGCHANG_WORLD.width / YONGCHANG_WORLD.chunkSize),
  rows: Math.ceil(YONGCHANG_WORLD.height / YONGCHANG_WORLD.chunkSize),
});

export function getWorldChunkId(point) {
  const column = clamp(
    Math.floor(Number(point?.x) / YONGCHANG_WORLD.chunkSize),
    0,
    chunkGrid.columns - 1,
  );
  const row = clamp(
    Math.floor(Number(point?.y) / YONGCHANG_WORLD.chunkSize),
    0,
    chunkGrid.rows - 1,
  );
  return `c${column}-r${row}`;
}

export function getVisibleWorldChunks(camera, viewport, options = {}) {
  const size = viewportSize(viewport);
  const overscan = Number.isFinite(options.overscan)
    ? Math.max(0, Math.floor(options.overscan))
    : 1;
  const halfWidth = size.width / (camera.scale * 2);
  const halfHeight = size.height / (camera.scale * 2);
  const minColumn = clamp(
    Math.floor((camera.centerX - halfWidth) / YONGCHANG_WORLD.chunkSize) -
      overscan,
    0,
    chunkGrid.columns - 1,
  );
  const maxColumn = clamp(
    Math.floor((camera.centerX + halfWidth) / YONGCHANG_WORLD.chunkSize) +
      overscan,
    0,
    chunkGrid.columns - 1,
  );
  const minRow = clamp(
    Math.floor((camera.centerY - halfHeight) / YONGCHANG_WORLD.chunkSize) -
      overscan,
    0,
    chunkGrid.rows - 1,
  );
  const maxRow = clamp(
    Math.floor((camera.centerY + halfHeight) / YONGCHANG_WORLD.chunkSize) +
      overscan,
    0,
    chunkGrid.rows - 1,
  );
  const chunks = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      chunks.push(`c${column}-r${row}`);
    }
  }
  return Object.freeze(chunks);
}

export function createFocusAreaGeoJson(points, metadata = {}) {
  const normalized = points.map((point) => {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (
      !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 ||
      x > YONGCHANG_WORLD.width || y > YONGCHANG_WORLD.height
    ) {
      throw new TypeError(
        "Focus-area points must be finite and inside the Yongchang world",
      );
    }
    return Object.freeze({ x, y });
  });
  const unique = new Set(
    normalized.map(({ x, y }) => `${x.toFixed(3)},${y.toFixed(3)}`),
  );
  if (unique.size < 3) {
    throw new TypeError(
      "A focus-area polygon needs at least three unique points",
    );
  }

  const coordinates = normalized.map((point) => {
    const geographic = unprojectWorldPoint(point);
    return Object.freeze([geographic.longitude, geographic.latitude]);
  });
  coordinates.push(Object.freeze([...coordinates[0]]));

  return Object.freeze({
    type: "Feature",
    properties: Object.freeze({
      name: "圣灯社区高精度展示范围",
      boundaryKind: "product-focus-area",
      administrativeBoundary: false,
      coordinateSystem: "WGS84",
      purpose: metadata.purpose || "限定圣灯社区高精度艺术模型的加载范围",
      draftedBy: metadata.draftedBy || "未署名绘制者",
      draftedAt: metadata.draftedAt || new Date().toISOString(),
      version: Math.max(1, Math.floor(Number(metadata.version) || 1)),
    }),
    geometry: Object.freeze({
      type: "Polygon",
      coordinates: Object.freeze([Object.freeze(coordinates)]),
    }),
  });
}

export function focusAreaGeoJsonToWorldPoints(feature) {
  const ring = feature?.type === "Feature" &&
      feature?.properties?.boundaryKind === "product-focus-area" &&
      feature?.geometry?.type === "Polygon"
    ? feature.geometry.coordinates?.[0]
    : null;
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new TypeError("Expected a product focus-area GeoJSON Polygon");
  }
  const coordinates = [...ring];
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (first?.[0] === last?.[0] && first?.[1] === last?.[1]) coordinates.pop();
  if (coordinates.length < 3) {
    throw new TypeError(
      "Focus-area GeoJSON needs at least three unique points",
    );
  }
  return Object.freeze(coordinates.map(([longitude, latitude]) => {
    const point = projectGeographicPoint({ longitude, latitude });
    if (
      point.x < 0 || point.y < 0 || point.x > YONGCHANG_WORLD.width ||
      point.y > YONGCHANG_WORLD.height
    ) {
      throw new TypeError("Focus-area GeoJSON is outside the Yongchang world");
    }
    return point;
  }));
}
