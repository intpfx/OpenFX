import type { Coord } from "../../../domains/map-poster/src/types.ts";

const OFFICIAL_NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const REQUEST_INTERVAL_MS = 1_000;
const CACHE_TTL_MS = 30 * 60 * 1_000;

type FetchLike = typeof fetch;

export type MapPosterResolvedPlace = {
  city: string;
  country: string;
};

type ReverseGeocodeEnvironment = Record<string, string | undefined>;

type ReverseGeocodeDependencies = {
  endpoint?: URL;
  fetcher?: FetchLike;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  cacheTtlMs?: number;
};

const REVERSE_CITY_KEYS = [
  "city",
  "town",
  "municipality",
  "village",
  "county",
] as const;

function readAddressText(address: Record<string, unknown>, key: string) {
  const value = address[key];
  return typeof value === "string" ? value.trim() : "";
}

export function resolveReverseAddress(
  value: unknown,
): MapPosterResolvedPlace | undefined {
  if (!value || typeof value !== "object") return undefined;

  const addressValue = (value as { address?: unknown }).address;
  if (!addressValue || typeof addressValue !== "object") return undefined;

  const address = addressValue as Record<string, unknown>;
  const city = REVERSE_CITY_KEYS
    .map((key) => readAddressText(address, key))
    .find(Boolean) ?? "";
  const country = readAddressText(address, "country");

  if (!city || !country) return undefined;
  return { city, country };
}

export function isProductionEnvironment(
  environment: ReverseGeocodeEnvironment,
) {
  return Boolean(environment.DENO_DEPLOYMENT_ID?.trim()) ||
    environment.NODE_ENV?.trim().toLowerCase() === "production";
}

export function parseReverseGeocodeEndpoint(
  value: string | undefined,
): URL | undefined {
  const configured = value?.trim();
  if (!configured) return undefined;

  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash
    ) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

export function resolveReverseGeocodeEndpoint(
  environment: ReverseGeocodeEnvironment,
): URL | undefined {
  const configured = environment.OPENFX_MAP_POSTER_NOMINATIM_REVERSE_URL;
  if (configured?.trim()) return parseReverseGeocodeEndpoint(configured);

  if (isProductionEnvironment(environment)) return undefined;
  return new URL(OFFICIAL_NOMINATIM_REVERSE_URL);
}

function reverseGeocodeKey(center: Coord) {
  // About one kilometre: sufficient to deduplicate a city-background revisit
  // without retaining the device's full-precision coordinates in memory.
  return `${center.lat.toFixed(2)}:${center.lon.toFixed(2)}`;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function createReverseGeocodeService(
  dependencies: ReverseGeocodeDependencies = {},
) {
  const endpoint = dependencies.endpoint;
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? delay;
  const cacheTtlMs = dependencies.cacheTtlMs ?? CACHE_TTL_MS;
  const cache = new Map<string, { expiresAt: number; place: MapPosterResolvedPlace }>();
  const pending = new Map<string, Promise<MapPosterResolvedPlace | undefined>>();
  let queue = Promise.resolve();
  let nextRequestAt = 0;

  const requestPlace = async (center: Coord) => {
    if (!endpoint) return undefined;

    const waitMs = Math.max(nextRequestAt - now(), 0);
    if (waitMs > 0) await sleep(waitMs);
    nextRequestAt = Math.max(nextRequestAt, now()) + REQUEST_INTERVAL_MS;

    const url = new URL(endpoint);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(center.lat));
    url.searchParams.set("lon", String(center.lon));
    url.searchParams.set("zoom", "10");
    url.searchParams.set("addressdetails", "1");

    try {
      const response = await fetcher(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "OpenFX-MapPoster-Web/0.1 (github.com/intpfx)",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) return undefined;
      return resolveReverseAddress(await response.json());
    } catch {
      return undefined;
    }
  };

  const enqueue = (center: Coord) => {
    const request = queue.then(() => requestPlace(center));
    queue = request.then(() => undefined, () => undefined);
    return request;
  };

  return {
    async lookup(center: Coord): Promise<MapPosterResolvedPlace | undefined> {
      if (!endpoint) return undefined;

      const key = reverseGeocodeKey(center);
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now()) return cached.place;
      if (cached) cache.delete(key);

      const active = pending.get(key);
      if (active) return await active;

      const request = enqueue(center).then((place) => {
        if (place) {
          cache.set(key, { place, expiresAt: now() + cacheTtlMs });
        }
        return place;
      }).finally(() => pending.delete(key));
      pending.set(key, request);
      return await request;
    },
  };
}

function readRuntimeEnvironment(): ReverseGeocodeEnvironment {
  try {
    return Deno.env.toObject();
  } catch {
    return {};
  }
}

export const defaultReverseGeocodeService = createReverseGeocodeService({
  endpoint: resolveReverseGeocodeEndpoint(readRuntimeEnvironment()),
});
