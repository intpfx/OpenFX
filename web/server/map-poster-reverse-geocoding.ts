import type {
  Coord,
  MapPosterResolvedPlace,
} from "../../domains/map-poster/src/types.ts";

const OFFICIAL_NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const OFFICIAL_NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const REQUEST_INTERVAL_MS = 1_000;
const CACHE_TTL_MS = 30 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 256;
const MAX_QUEUED_REQUESTS = 32;

type FetchLike = typeof fetch;

type NominatimEnvironment = Record<string, string | undefined>;

type NominatimDependencies = {
  searchEndpoint?: URL;
  reverseEndpoint?: URL;
  fetcher?: FetchLike;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  maxQueuedRequests?: number;
};

type NominatimResult = Coord | MapPosterResolvedPlace | null;

type SearchCacheEntry = {
  expiresAt: number;
  value: Coord | null;
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

export function isProductionEnvironment(environment: NominatimEnvironment) {
  return Boolean(environment.DENO_DEPLOYMENT_ID?.trim()) ||
    environment.NODE_ENV?.trim().toLowerCase() === "production";
}

export function parseNominatimEndpoint(
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

export function resolveNominatimEndpoints(environment: NominatimEnvironment) {
  const production = isProductionEnvironment(environment);
  const searchConfigured = environment.OPENFX_MAP_POSTER_NOMINATIM_SEARCH_URL;
  const reverseConfigured = environment.OPENFX_MAP_POSTER_NOMINATIM_REVERSE_URL;

  return {
    search: searchConfigured?.trim()
      ? parseNominatimEndpoint(searchConfigured)
      : production
      ? undefined
      : new URL(OFFICIAL_NOMINATIM_SEARCH_URL),
    reverse: reverseConfigured?.trim()
      ? parseNominatimEndpoint(reverseConfigured)
      : production
      ? undefined
      : new URL(OFFICIAL_NOMINATIM_REVERSE_URL),
  };
}

// Backward-compatible narrow helpers keep endpoint policy tests readable.
export const parseReverseGeocodeEndpoint = parseNominatimEndpoint;
export function resolveReverseGeocodeEndpoint(
  environment: NominatimEnvironment,
) {
  return resolveNominatimEndpoints(environment).reverse;
}

function reverseGeocodeKey(center: Coord) {
  // About one kilometre: enough to deduplicate concurrent background requests without
  // retaining a device's full-precision location while the request is in flight.
  return `reverse:${center.lat.toFixed(2)}:${center.lon.toFixed(2)}`;
}

function searchKey(city: string, country: string) {
  return JSON.stringify([
    "search",
    city.trim().toLowerCase(),
    country.trim().toLowerCase(),
  ]);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function addNominatimParameters(url: URL, parameters: Record<string, string>) {
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export function createNominatimService(
  dependencies: NominatimDependencies = {},
) {
  const searchEndpoint = dependencies.searchEndpoint;
  const reverseEndpoint = dependencies.reverseEndpoint;
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? delay;
  const cacheTtlMs = dependencies.cacheTtlMs ?? CACHE_TTL_MS;
  const maxCacheEntries = dependencies.maxCacheEntries ?? MAX_CACHE_ENTRIES;
  const maxQueuedRequests = dependencies.maxQueuedRequests ??
    MAX_QUEUED_REQUESTS;
  const searchCache = new Map<string, SearchCacheEntry>();
  const pending = new Map<string, Promise<NominatimResult | undefined>>();
  let queue = Promise.resolve<unknown>(undefined);
  let nextRequestAt = 0;

  const pruneExpiredCache = () => {
    const currentTime = now();
    for (const [key, entry] of searchCache) {
      if (entry.expiresAt <= currentTime) searchCache.delete(key);
    }
  };

  const readCached = (key: string) => {
    pruneExpiredCache();
    const entry = searchCache.get(key);
    if (!entry) return undefined;
    // Map insertion order is our LRU order; a read promotes the entry.
    searchCache.delete(key);
    searchCache.set(key, entry);
    return entry.value;
  };

  const cacheValue = (key: string, value: SearchCacheEntry["value"]) => {
    pruneExpiredCache();
    searchCache.delete(key);
    searchCache.set(key, { value, expiresAt: now() + cacheTtlMs });
    while (searchCache.size > maxCacheEntries) {
      const oldest = searchCache.keys().next().value;
      if (!oldest) break;
      searchCache.delete(oldest);
    }
  };

  const request = async <T extends NominatimResult>(
    endpoint: URL,
    parameters: Record<string, string>,
    parse: (response: Response) => Promise<T | undefined>,
  ) => {
    const waitMs = Math.max(nextRequestAt - now(), 0);
    if (waitMs > 0) await sleep(waitMs);
    nextRequestAt = Math.max(nextRequestAt, now()) + REQUEST_INTERVAL_MS;

    try {
      const response = await fetcher(
        addNominatimParameters(new URL(endpoint), parameters),
        {
          headers: {
            "Accept": "application/json",
            "User-Agent": "OpenFX-MapPoster-Web/0.1 (github.com/intpfx)",
          },
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (!response.ok) return undefined;
      return await parse(response);
    } catch {
      return undefined;
    }
  };

  const enqueue = <T extends NominatimResult>(
    key: string,
    endpoint: URL | undefined,
    parameters: Record<string, string>,
    parse: (response: Response) => Promise<T | undefined>,
  ) => {
    if (!endpoint) return undefined;
    const active = pending.get(key);
    if (active) return active as Promise<T | undefined>;
    if (pending.size >= maxQueuedRequests) return undefined;

    const queued = queue.then(() => request(endpoint, parameters, parse));
    queue = queued.then(() => undefined, () => undefined);
    pending.set(key, queued);
    void queued.finally(() => pending.delete(key));
    return queued;
  };

  return {
    async reverse(center: Coord): Promise<MapPosterResolvedPlace | undefined> {
      const key = reverseGeocodeKey(center);
      const result = await enqueue(
        key,
        reverseEndpoint,
        {
          format: "jsonv2",
          lat: String(center.lat),
          lon: String(center.lon),
          zoom: "10",
          addressdetails: "1",
        },
        async (response) => resolveReverseAddress(await response.json()),
      );
      return result as MapPosterResolvedPlace | undefined;
    },
    async search(
      city: string,
      country: string,
    ): Promise<Coord | null | undefined> {
      const key = searchKey(city, country);
      const cached = readCached(key);
      if (cached !== undefined) return cached as Coord | null;

      const result = await enqueue(
        key,
        searchEndpoint,
        { format: "jsonv2", limit: "1", q: `${city}, ${country}` },
        async (response) => {
          const data = await response.json() as {
            lat?: string;
            lon?: string;
          }[];
          const first = data[0];
          const lat = Number.parseFloat(first?.lat ?? "");
          const lon = Number.parseFloat(first?.lon ?? "");
          return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
        },
      );
      if (result !== undefined) cacheValue(key, result);
      return result as Coord | null | undefined;
    },
  };
}

export function createReverseGeocodeService(
  dependencies: Omit<NominatimDependencies, "searchEndpoint"> & {
    endpoint?: URL;
  } = {},
) {
  const service = createNominatimService({
    ...dependencies,
    reverseEndpoint: dependencies.endpoint,
  });
  return { lookup: service.reverse };
}

function readRuntimeEnvironment(): NominatimEnvironment {
  try {
    return Deno.env.toObject();
  } catch {
    return {};
  }
}

const runtimeEndpoints = resolveNominatimEndpoints(readRuntimeEnvironment());
export const defaultNominatimService = createNominatimService({
  searchEndpoint: runtimeEndpoints.search,
  reverseEndpoint: runtimeEndpoints.reverse,
});
export const defaultReverseGeocodeService = {
  lookup: defaultNominatimService.reverse,
};
