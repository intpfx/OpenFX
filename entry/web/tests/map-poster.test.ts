import { expect } from "@std/expect";

import { createMapPoster, MapPosterInputError } from "../server/map-poster.ts";
import {
  createNominatimService,
  parseReverseGeocodeEndpoint,
  resolveNominatimEndpoints,
  resolveReverseGeocodeEndpoint,
} from "../server/map-poster-reverse-geocoding.ts";

function emptyMapData(center: { lat: number; lon: number }) {
  return {
    roads: [],
    water: [],
    parks: [],
    bbox: {
      minLon: center.lon - 0.01,
      minLat: center.lat - 0.01,
      maxLon: center.lon + 0.01,
      maxLat: center.lat + 0.01,
    },
  };
}

Deno.test("map poster renderer creates a downloadable SVG from validated input", async () => {
  const result = await createMapPoster(
    {
      city: "Tokyo",
      country: "Japan",
      theme: "japanese_ink",
      width: 1200,
      height: 1600,
      distanceMeters: 8000,
    },
    {
      geocode: () => Promise.resolve({ lat: 35.6812, lon: 139.7671 }),
      fetchData: () =>
        Promise.resolve({
          roads: [
            {
              d: "M139.7600,35.6750L139.7671,35.6812L139.7740,35.6880",
              bbox: [0, 0, 0, 0],
              tags: { highway: "primary" },
            },
          ],
          water: [],
          parks: [],
          bbox: {
            minLon: 139.755,
            minLat: 35.67,
            maxLon: 139.78,
            maxLat: 35.69,
          },
        }),
    },
  );

  expect(result.ok).toBe(true);
  expect(result.filename).toBe("openfx-map-poster-tokyo-japanese_ink.svg");
  expect(result.width).toBe(1200);
  expect(result.height).toBe(1600);
  expect(result.stats.roads).toBe(1);
  expect(result.svg).toContain("<svg");
  expect(result.svg).toContain("T  O  K  Y  O");
});

Deno.test("map poster renderer rejects unknown themes", async () => {
  await expect(createMapPoster({
    city: "Tokyo",
    country: "Japan",
    theme: "not-a-theme",
  })).rejects.toThrow(MapPosterInputError);
});

Deno.test("map poster presets can render without geocoding network access", async () => {
  const result = await createMapPoster(
    {
      city: "Tokyo",
      country: "Japan",
      theme: "japanese_ink",
    },
    {
      fetchData: (center) =>
        Promise.resolve({
          roads: [],
          water: [],
          parks: [],
          bbox: {
            minLon: center.lon - 0.01,
            minLat: center.lat - 0.01,
            maxLon: center.lon + 0.01,
            maxLat: center.lat + 0.01,
          },
        }),
    },
  );

  expect(result.center.lat).toBe(35.6768601);
  expect(result.center.lon).toBe(139.7638947);
});

Deno.test("map poster can render from a map-picked coordinate without geocoding", async () => {
  let geocodeCalled = false;
  const pickedCenter = { lat: 31.2304, lon: 121.4737 };
  const result = await createMapPoster(
    {
      city: "Picked Point",
      country: "OpenStreetMap",
      latitude: pickedCenter.lat,
      longitude: pickedCenter.lon,
      theme: "japanese_ink",
    },
    {
      geocode: () => {
        geocodeCalled = true;
        throw new Error("geocode should not be used for direct coordinates");
      },
      reverseGeocode: () => Promise.resolve(undefined),
      fetchData: (center) => {
        expect(center).toEqual(pickedCenter);
        return Promise.resolve({
          roads: [],
          water: [],
          parks: [],
          bbox: {
            minLon: center.lon - 0.01,
            minLat: center.lat - 0.01,
            maxLon: center.lon + 0.01,
            maxLat: center.lat + 0.01,
          },
        });
      },
    },
  );

  expect(geocodeCalled).toBe(false);
  expect(result.center).toEqual(pickedCenter);
  expect(result.svg).toContain("L  O  C  A  L     A  R  E  A");
});

Deno.test("map poster resolves display labels for direct homepage coordinates", async () => {
  let renderedLabels:
    | { displayCity?: string; displayCountry?: string }
    | undefined;

  const result = await createMapPoster(
    {
      latitude: 31.2304,
      longitude: 121.4737,
      theme: "japanese_ink",
      width: 1600,
      height: 1000,
      distanceMeters: 6000,
    },
    {
      fetchData: (center) => Promise.resolve(emptyMapData(center)),
      reverseGeocode: () => Promise.resolve({ city: "Shanghai", country: "China" }),
      render: (_data, _center, _theme, _width, _height, labels) => {
        renderedLabels = labels;
        return "<svg/>";
      },
    },
  );

  expect(renderedLabels?.displayCity).toBe("Shanghai");
  expect(renderedLabels?.displayCountry).toBe("China");
  expect(result.place).toEqual({ city: "Shanghai", country: "China" });
});

Deno.test("map poster reverse lookup uses Nominatim city priority and fixed headers", async () => {
  let requestedUrl = "";
  let requestedUserAgent = "";
  const reverseGeocoder = createNominatimService({
    reverseEndpoint: new URL("https://nominatim.openstreetmap.org/reverse"),
    fetcher: (input, init) => {
      requestedUrl = String(input);
      requestedUserAgent = new Headers(init?.headers).get("user-agent") ?? "";
      return Promise.resolve(
        new Response(
          JSON.stringify({
            address: {
              city: "Shanghai",
              municipality: "Shanghai Municipality",
              country: "China",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    },
  });

  const result = await createMapPoster(
    {
      latitude: 31.2304,
      longitude: 121.4737,
      theme: "japanese_ink",
    },
    {
      fetchData: (center) => Promise.resolve(emptyMapData(center)),
      reverseGeocode: reverseGeocoder.reverse,
      render: () => "<svg/>",
    },
  );

  const url = new URL(requestedUrl);
  expect(url.pathname).toBe("/reverse");
  expect(url.searchParams.get("format")).toBe("jsonv2");
  expect(url.searchParams.get("zoom")).toBe("10");
  expect(requestedUserAgent).toContain("OpenFX-MapPoster-Web");
  expect(result.place).toEqual({ city: "Shanghai", country: "China" });
});

Deno.test("map poster Nominatim endpoints use local defaults and both fail closed in production", () => {
  expect(
    resolveReverseGeocodeEndpoint({ NODE_ENV: "development" })?.toString(),
  ).toBe("https://nominatim.openstreetmap.org/reverse");
  expect(resolveReverseGeocodeEndpoint({ NODE_ENV: "production" })).toBeUndefined();
  expect(
    resolveNominatimEndpoints({ NODE_ENV: "production" }).search,
  ).toBeUndefined();
  expect(
    resolveNominatimEndpoints({
      NODE_ENV: "production",
      OPENFX_MAP_POSTER_NOMINATIM_REVERSE_URL: "https://geo.openfx.example/reverse",
      OPENFX_MAP_POSTER_NOMINATIM_SEARCH_URL: "https://geo.openfx.example/search",
    }).reverse?.toString(),
  ).toBe("https://geo.openfx.example/reverse");
  expect(
    resolveNominatimEndpoints({
      NODE_ENV: "production",
      OPENFX_MAP_POSTER_NOMINATIM_REVERSE_URL: "https://geo.openfx.example/reverse",
      OPENFX_MAP_POSTER_NOMINATIM_SEARCH_URL: "https://geo.openfx.example/search",
    }).search?.toString(),
  ).toBe("https://geo.openfx.example/search");
  expect(parseReverseGeocodeEndpoint("http://localhost:8080/reverse"))
    .toBeUndefined();
  expect(parseReverseGeocodeEndpoint("https://user:secret@geo.example/reverse"))
    .toBeUndefined();
});

Deno.test("map poster Nominatim broker spaces aggregate search and reverse calls and shares rounded reverse work", async () => {
  let now = 0;
  const callTimes: number[] = [];
  let fetchCalls = 0;
  const broker = createNominatimService({
    searchEndpoint: new URL("https://geo.openfx.example/search"),
    reverseEndpoint: new URL("https://geo.openfx.example/reverse"),
    now: () => now,
    sleep: (milliseconds) => {
      now += milliseconds;
      return Promise.resolve();
    },
    fetcher: (input) => {
      fetchCalls += 1;
      callTimes.push(now);
      const url = new URL(String(input));
      return Promise.resolve(
        new Response(
          url.pathname === "/search"
            ? JSON.stringify([{ lat: "31.2304", lon: "121.4737" }])
            : JSON.stringify({
              address: { city: "Shanghai", country: "China" },
            }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    },
  });

  const first = broker.reverse({ lat: 31.2304, lon: 121.4737 });
  const duplicate = broker.reverse({ lat: 31.23049, lon: 121.47371 });
  const search = broker.search("Shanghai", "China");
  const second = broker.reverse({ lat: 39.9042, lon: 116.4074 });
  await expect(Promise.all([first, duplicate, search, second])).resolves.toEqual([
    { city: "Shanghai", country: "China" },
    { city: "Shanghai", country: "China" },
    { lat: 31.2304, lon: 121.4737 },
    { city: "Shanghai", country: "China" },
  ]);

  expect(fetchCalls).toBe(3);
  expect(callTimes).toEqual([0, 1_000, 2_000]);
  await broker.reverse({ lat: 31.23041, lon: 121.47372 });
  expect(fetchCalls).toBe(3);
});

Deno.test("map poster Nominatim broker prunes TTL entries, evicts LRU entries, and drops queue overflow", async () => {
  let now = 0;
  let releaseFirst: (() => void) | undefined;
  const firstFetch = new Promise<Response>((resolve) => {
    releaseFirst = () =>
      resolve(
        new Response(
          JSON.stringify([
            { lat: "31.2304", lon: "121.4737" },
          ]),
          { headers: { "content-type": "application/json" } },
        ),
      );
  });
  let fetchCalls = 0;
  const broker = createNominatimService({
    searchEndpoint: new URL("https://geo.openfx.example/search"),
    now: () => now,
    sleep: (milliseconds) => {
      now += milliseconds;
      return Promise.resolve();
    },
    cacheTtlMs: 10_000,
    maxCacheEntries: 2,
    maxQueuedRequests: 3,
    fetcher: () => {
      fetchCalls += 1;
      return fetchCalls === 1 ? firstFetch : Promise.resolve(
        new Response(
          JSON.stringify([
            { lat: "31.2304", lon: "121.4737" },
          ]),
          { headers: { "content-type": "application/json" } },
        ),
      );
    },
  });

  const queued = [
    broker.search("A", "China"),
    broker.search("B", "China"),
    broker.search("C", "China"),
  ];
  expect(await broker.search("Overflow", "China")).toBeUndefined();
  releaseFirst?.();
  await Promise.all(queued);
  expect(fetchCalls).toBe(3);

  await broker.search("B", "China");
  await broker.search("D", "China");
  await broker.search("B", "China");
  expect(fetchCalls).toBe(4);

  now += 10_001;
  await broker.search("D", "China");
  expect(fetchCalls).toBe(5);
});

Deno.test("map poster keeps real coordinates when reverse lookup fails", async () => {
  let renderedLabels:
    | { displayCity?: string; displayCountry?: string }
    | undefined;

  const result = await createMapPoster(
    { latitude: 31.2304, longitude: 121.4737 },
    {
      fetchData: (center) => Promise.resolve(emptyMapData(center)),
      reverseGeocode: () => Promise.reject(new Error("reverse unavailable")),
      render: (_data, _center, _theme, _width, _height, labels) => {
        renderedLabels = labels;
        return "<svg/>";
      },
    },
  );

  expect(result.center).toEqual({ lat: 31.2304, lon: 121.4737 });
  expect(result.place).toBeUndefined();
  expect(renderedLabels?.displayCity).toBe("LOCAL AREA");
  expect(renderedLabels?.displayCountry).toBe("OPENSTREETMAP");
});

Deno.test("map poster preserves explicit display labels without reverse lookup", async () => {
  let reverseCalls = 0;

  const result = await createMapPoster(
    {
      latitude: 31.2304,
      longitude: 121.4737,
      displayCity: "My Shanghai",
      displayCountry: "China",
    },
    {
      fetchData: (center) => Promise.resolve(emptyMapData(center)),
      reverseGeocode: () => {
        reverseCalls += 1;
        return Promise.resolve({ city: "Shanghai", country: "China" });
      },
      render: () => "<svg/>",
    },
  );

  expect(reverseCalls).toBe(0);
  expect(result.place).toBeUndefined();
});
