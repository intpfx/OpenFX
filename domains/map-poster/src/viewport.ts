import type { Coord } from "./types.ts";

export type MapViewportSize = {
  width: number;
  height: number;
};

export type MapTile = {
  key: string;
  src: string;
  left: number;
  top: number;
};

const TILE_SIZE = 256;
const MAX_MERCATOR_LAT = 85.05112878;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeLongitude(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function mapPixelSize(zoom: number) {
  return TILE_SIZE * 2 ** zoom;
}

function lonToWorldX(lon: number, zoom: number) {
  return ((normalizeLongitude(lon) + 180) / 360) * mapPixelSize(zoom);
}

function latToWorldY(lat: number, zoom: number) {
  const clampedLat = clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT);
  const radians = clampedLat * Math.PI / 180;
  return (
    (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2
  ) * mapPixelSize(zoom);
}

function worldXToLon(x: number, zoom: number) {
  return x / mapPixelSize(zoom) * 360 - 180;
}

function worldYToLat(y: number, zoom: number) {
  const n = Math.PI - 2 * Math.PI * y / mapPixelSize(zoom);
  return 180 / Math.PI * Math.atan(Math.sinh(n));
}

function worldToCoord(x: number, y: number, zoom: number): Coord {
  const size = mapPixelSize(zoom);
  const wrappedX = ((x % size) + size) % size;
  const safeY = clamp(y, 0, size);
  return {
    lat: clamp(worldYToLat(safeY, zoom), -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT),
    lon: normalizeLongitude(worldXToLon(wrappedX, zoom)),
  };
}

export function moveMapCenterByPixels(
  center: Coord,
  zoom: number,
  deltaX: number,
  deltaY: number,
): Coord {
  return worldToCoord(
    lonToWorldX(center.lon, zoom) + deltaX,
    latToWorldY(center.lat, zoom) + deltaY,
    zoom,
  );
}

export function getVisibleMapTiles(
  center: Coord,
  zoom: number,
  viewport: MapViewportSize,
): MapTile[] {
  const width = Math.max(viewport.width, 1);
  const height = Math.max(viewport.height, 1);
  const centerX = lonToWorldX(center.lon, zoom);
  const centerY = latToWorldY(center.lat, zoom);
  const minTileX = Math.floor((centerX - width / 2) / TILE_SIZE);
  const maxTileX = Math.floor((centerX + width / 2) / TILE_SIZE);
  const minTileY = Math.floor((centerY - height / 2) / TILE_SIZE);
  const maxTileY = Math.floor((centerY + height / 2) / TILE_SIZE);
  const tilesPerAxis = 2 ** zoom;
  const tiles: MapTile[] = [];

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      if (tileY < 0 || tileY >= tilesPerAxis) continue;
      const wrappedX = ((tileX % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;
      tiles.push({
        key: `${zoom}-${tileX}-${tileY}`,
        src: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
        left: tileX * TILE_SIZE - centerX + width / 2,
        top: tileY * TILE_SIZE - centerY + height / 2,
      });
    }
  }

  return tiles;
}
