import {
  fetchMapData,
  type FetchResult,
} from "../../../domains/map-poster/src/overpass.ts";
import { renderSvg } from "../../../domains/map-poster/src/renderer.ts";
import { getTheme } from "../../../domains/map-poster/src/themes.ts";
import type {
  Coord,
  GeoFeature,
  Theme,
} from "../../../domains/map-poster/src/types.ts";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const DEFAULT_DISTANCE_METERS = 4_000;
const MIN_DISTANCE_METERS = 4_000;
const MAX_DISTANCE_METERS = 12_000;
const MIN_POSTER_SIDE = 800;
const MAX_POSTER_SIDE = 4_800;
const MAX_WEB_ROADS = 9_000;
const MAX_WEB_WATER = 600;
const MAX_WEB_PARKS = 1_000;
const KNOWN_PLACE_COORDS = new Map<string, Coord>([
  ["tokyo::japan", { lat: 35.6768601, lon: 139.7638947 }],
  ["shanghai::china", { lat: 31.2304, lon: 121.4737 }],
  ["new york::united states", { lat: 40.7128, lon: -74.006 }],
  ["venice::italy", { lat: 45.4408, lon: 12.3155 }],
  ["dubai::united arab emirates", { lat: 25.2048, lon: 55.2708 }],
  ["barcelona::spain", { lat: 41.3874, lon: 2.1686 }],
]);

type FetchLike = typeof fetch;

export type MapPosterRenderRequest = {
  city?: unknown;
  country?: unknown;
  displayCity?: unknown;
  displayCountry?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  theme?: unknown;
  distanceMeters?: unknown;
  width?: unknown;
  height?: unknown;
};

export type MapPosterRenderResult = {
  ok: true;
  svg: string;
  filename: string;
  width: number;
  height: number;
  theme: string;
  city: string;
  country: string;
  center: Coord;
  stats: {
    roads: number;
    water: number;
    parks: number;
    distanceMeters: number;
  };
};

export class MapPosterInputError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}

function readText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function readRequiredText(value: unknown, code: string) {
  const text = readText(value);
  if (text.length < 2 || text.length > 80) {
    throw new MapPosterInputError(code);
  }
  return text;
}

function readPointLabel(value: unknown, fallback: string, code: string) {
  const text = readText(value) || fallback;
  if (text.length < 2 || text.length > 80) {
    throw new MapPosterInputError(code);
  }
  return text;
}

function readOptionalDisplayText(value: unknown) {
  const text = readText(value);
  if (!text) return undefined;
  if (text.length > 80) throw new MapPosterInputError("invalid_display_name");
  return text;
}

function readInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  code: string,
) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.round(parsed);
  if (integer < min || integer > max) throw new MapPosterInputError(code);
  return integer;
}

function readCoordinate(
  value: unknown,
  min: number,
  max: number,
  code: string,
) {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new MapPosterInputError(code);
  }
  return parsed;
}

function readDirectCenter(input: MapPosterRenderRequest) {
  const latitude = readCoordinate(
    input.latitude,
    -85.05112878,
    85.05112878,
    "invalid_latitude",
  );
  const longitude = readCoordinate(
    input.longitude,
    -180,
    180,
    "invalid_longitude",
  );

  if (latitude === undefined && longitude === undefined) return undefined;
  if (latitude === undefined) throw new MapPosterInputError("invalid_latitude");
  if (longitude === undefined) throw new MapPosterInputError("invalid_longitude");

  return { lat: latitude, lon: longitude };
}

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "map-poster";
}

function placeKey(city: string, country: string) {
  return `${city.trim().toLowerCase()}::${country.trim().toLowerCase()}`;
}

function getHighwayValue(feature: GeoFeature) {
  const highway = feature.tags.highway;
  if (Array.isArray(highway)) return highway[0] ?? "";
  return highway ?? "";
}

function isMajorRoad(feature: GeoFeature) {
  return /^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link)$/
    .test(getHighwayValue(feature));
}

function sampleFeatures<T>(features: T[], maxCount: number) {
  if (features.length <= maxCount) return features;

  const sampled: T[] = [];
  const step = features.length / maxCount;
  for (let index = 0; index < maxCount; index += 1) {
    sampled.push(features[Math.floor(index * step)]);
  }
  return sampled;
}

function limitRoads(roads: GeoFeature[]) {
  if (roads.length <= MAX_WEB_ROADS) return roads;

  const major = roads.filter(isMajorRoad);
  const minor = roads.filter((road) => !isMajorRoad(road));
  const majorRoads = sampleFeatures(major, Math.min(major.length, 3_000));
  const remaining = Math.max(MAX_WEB_ROADS - majorRoads.length, 0);
  return [...majorRoads, ...sampleFeatures(minor, remaining)];
}

function limitMapData(data: FetchResult): FetchResult {
  return {
    ...data,
    roads: limitRoads(data.roads),
    water: sampleFeatures(data.water, MAX_WEB_WATER),
    parks: sampleFeatures(data.parks, MAX_WEB_PARKS),
  };
}

function normalizeInput(input: MapPosterRenderRequest) {
  const directCenter = readDirectCenter(input);
  const city = directCenter
    ? readPointLabel(input.city, "Selected Point", "invalid_city")
    : readRequiredText(input.city, "invalid_city");
  const country = directCenter
    ? readPointLabel(input.country, "OpenStreetMap", "invalid_country")
    : readRequiredText(input.country, "invalid_country");
  const themeName = readText(input.theme, "japanese_ink");
  const theme = getTheme(themeName);

  if (!theme) {
    throw new MapPosterInputError("invalid_theme");
  }

  return {
    city,
    country,
    directCenter,
    displayCity: readOptionalDisplayText(input.displayCity),
    displayCountry: readOptionalDisplayText(input.displayCountry),
    theme,
    distanceMeters: readInteger(
      input.distanceMeters,
      DEFAULT_DISTANCE_METERS,
      MIN_DISTANCE_METERS,
      MAX_DISTANCE_METERS,
      "invalid_distance",
    ),
    width: readInteger(
      input.width,
      1_200,
      MIN_POSTER_SIDE,
      MAX_POSTER_SIDE,
      "invalid_width",
    ),
    height: readInteger(
      input.height,
      1_600,
      MIN_POSTER_SIDE,
      MAX_POSTER_SIDE,
      "invalid_height",
    ),
  };
}

async function geocodePlace(
  city: string,
  country: string,
  fetcher: FetchLike = fetch,
): Promise<Coord> {
  const knownCoord = KNOWN_PLACE_COORDS.get(placeKey(city, country));
  if (knownCoord) return knownCoord;

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", `${city}, ${country}`);

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "OpenFX-MapPoster-Web/0.1 (github.com/intpfx)",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new MapPosterInputError("geocoding_unavailable", 502);
  }

  if (!response.ok) {
    throw new MapPosterInputError("geocoding_unavailable", 502);
  }

  const data = await response.json() as { lat?: string; lon?: string }[];
  const first = data[0];
  const lat = Number.parseFloat(first?.lat ?? "");
  const lon = Number.parseFloat(first?.lon ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new MapPosterInputError("place_not_found", 404);
  }

  return { lat, lon };
}

export async function createMapPoster(
  input: MapPosterRenderRequest,
  deps: {
    fetcher?: FetchLike;
    geocode?: (city: string, country: string) => Promise<Coord>;
    fetchData?: (center: Coord, distanceMeters: number) => Promise<FetchResult>;
    render?: typeof renderSvg;
  } = {},
): Promise<MapPosterRenderResult> {
  const options = normalizeInput(input);
  const geocode = deps.geocode ??
    ((city, country) => geocodePlace(city, country, deps.fetcher));
  const fetchData = deps.fetchData ?? fetchMapData;
  const render = deps.render ?? renderSvg;
  const center = options.directCenter ?? await geocode(options.city, options.country);
  const data = limitMapData(await fetchData(center, options.distanceMeters));
  const svg = render(
    data,
    center,
    options.theme as Theme,
    options.width,
    options.height,
    {
      city: options.city,
      country: options.country,
      displayCity: options.displayCity,
      displayCountry: options.displayCountry,
      distanceMeters: options.distanceMeters,
    },
  );

  return {
    ok: true,
    svg,
    filename: `openfx-map-poster-${slugify(options.city)}-${options.theme.name}.svg`,
    width: options.width,
    height: options.height,
    theme: options.theme.name,
    city: options.city,
    country: options.country,
    center,
    stats: {
      roads: data.roads.length,
      water: data.water.length,
      parks: data.parks.length,
      distanceMeters: options.distanceMeters,
    },
  };
}
