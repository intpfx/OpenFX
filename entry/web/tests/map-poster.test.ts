import { expect } from "@std/expect";

import { createMapPoster, MapPosterInputError } from "../server/map-poster.ts";

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
      fetcher: () => {
        throw new Error("network should not be used for preset coordinates");
      },
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
      fetcher: () => {
        throw new Error("network should not be used for direct coordinates");
      },
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
  expect(result.svg).toContain("P  I  C  K  E  D");
});
