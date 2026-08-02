import {
  focusAreaGeoJsonToWorldPoints,
  getWorldChunkId,
} from "./community-world-model.js";

const distanceSquared = (left, right) =>
  (left.x - right.x) ** 2 + (left.y - right.y) ** 2;

const polygonBounds = (points) =>
  Object.freeze(points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  ));

function pointOnSegment(point, start, end) {
  const segmentLength = distanceSquared(start, end);
  if (segmentLength === 0) return distanceSquared(point, start) < 0.000_001;
  const cross = (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > 0.000_1) return false;
  const dot = (point.x - start.x) * (end.x - start.x) +
    (point.y - start.y) * (end.y - start.y);
  return dot >= 0 && dot <= segmentLength;
}

export function isWorldPointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const start = polygon[previous];
    const end = polygon[index];
    if (pointOnSegment(point, start, end)) return true;
    const crosses = (end.y > point.y) !== (start.y > point.y) &&
      point.x < (start.x - end.x) * (point.y - end.y) /
              (start.y - end.y) + end.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function nearestRoad(point, roadSegments) {
  let nearest = null;
  for (const segment of roadSegments) {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) continue;
    const ratio = Math.max(
      0,
      Math.min(
        1,
        ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) /
          lengthSquared,
      ),
    );
    const projection = {
      x: segment.start.x + dx * ratio,
      y: segment.start.y + dy * ratio,
    };
    const distance = Math.sqrt(distanceSquared(point, projection));
    if (!nearest || distance < nearest.distance) {
      nearest = Object.freeze({
        distance,
        angle: Math.atan2(dy, dx) * 180 / Math.PI,
      });
    }
  }
  return nearest;
}

function rotatedFootprint(center, width, depth, angle) {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];
  return Object.freeze(corners.map(([x, y]) =>
    Object.freeze({
      x: center.x + x * cosine - y * sine,
      y: center.y + x * sine + y * cosine,
    })
  ));
}

function createRoadSegments(preparedFeatures) {
  const segments = [];
  for (const feature of preparedFeatures) {
    if (feature.kind !== "road") continue;
    for (let index = 1; index < feature.points.length; index += 1) {
      segments.push(Object.freeze({
        start: feature.points[index - 1],
        end: feature.points[index],
      }));
    }
  }
  return Object.freeze(segments);
}

function createFocusAssets(points, bounds, preparedFeatures) {
  const roadSegments = createRoadSegments(preparedFeatures);
  const assets = [];
  const step = 46;
  const startX = Math.ceil((bounds.minX + 20) / step) * step;
  const startY = Math.ceil((bounds.minY + 20) / step) * step;
  let row = 0;

  for (let y = startY; y <= bounds.maxY - 20; y += step) {
    let column = 0;
    for (let x = startX; x <= bounds.maxX - 20; x += step) {
      const hash = (row * 37 + column * 53 + 17) % 97;
      const center = Object.freeze({
        x: x + (hash % 5 - 2) * 2.2,
        y: y + (hash % 7 - 3) * 1.8,
      });
      const road = nearestRoad(center, roadSegments);
      if (!road || road.distance < 13 || road.distance > 92) {
        column += 1;
        continue;
      }
      const kind = hash % 9 === 0 ? "courtyard" : "building";
      const width = kind === "courtyard" ? 32 : 24 + hash % 4 * 3;
      const depth = kind === "courtyard" ? 26 : 17 + hash % 3 * 3;
      const angle = Math.round(road.angle / 5) * 5;
      const footprint = rotatedFootprint(center, width, depth, angle);
      if (!footprint.every((point) => isWorldPointInPolygon(point, points))) {
        column += 1;
        continue;
      }
      assets.push(Object.freeze({
        id: `focus-${kind}-${row}-${column}`,
        kind,
        center,
        width,
        depth,
        angle,
        footprint,
        palette: hash % 4,
        height: kind === "courtyard" ? 5 : 8 + hash % 5,
        chunk: getWorldChunkId(center),
      }));
      if (assets.length >= 48) return Object.freeze(assets);
      column += 1;
    }
    row += 1;
  }
  return Object.freeze(assets);
}

export function createFocusDistrict(feature, preparedFeatures) {
  const points = focusAreaGeoJsonToWorldPoints(feature);
  const bounds = polygonBounds(points);
  const centroid = Object.freeze(points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  ));
  const center = Object.freeze({
    x: centroid.x / points.length,
    y: centroid.y / points.length,
  });
  const path =
    points.map((point, index) =>
      `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`
    ).join("") + "Z";
  const chunks = Object.freeze([
    ...new Set(points.map((point) => getWorldChunkId(point))),
  ]);
  return Object.freeze({
    feature,
    points,
    bounds,
    center,
    path,
    chunks,
    assets: createFocusAssets(points, bounds, preparedFeatures),
  });
}

export function positionInFocusArea(district, relativePosition) {
  const xRatio = Math.max(0.08, Math.min(0.92, Number(relativePosition?.x)));
  const yRatio = Math.max(0.08, Math.min(0.92, Number(relativePosition?.y)));
  let point = {
    x: district.bounds.minX +
      (district.bounds.maxX - district.bounds.minX) * xRatio,
    y: district.bounds.minY +
      (district.bounds.maxY - district.bounds.minY) * yRatio,
  };
  for (let step = 0; step < 12; step += 1) {
    if (isWorldPointInPolygon(point, district.points)) {
      return Object.freeze(point);
    }
    point = {
      x: point.x + (district.center.x - point.x) * 0.18,
      y: point.y + (district.center.y - point.y) * 0.18,
    };
  }
  return district.center;
}
