import type { Coord } from "./types.ts";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_PATH = "./cache/geocoding.json";

export async function geocode(city: string, country: string): Promise<Coord> {
  const key = `${city.toLowerCase()}_${country.toLowerCase()}`;

  // Try cache file
  try {
    const data = await Bun.file(CACHE_PATH).text();
    const json = JSON.parse(data);
    if (json[key]) {
      console.log(`\u2713 Using cached coordinates for ${city}, ${country}`);
      return json[key];
    }
  } catch {
    // no cache yet
  }

  console.log("Looking up coordinates...");

  const params = new URLSearchParams({
    q: `${city}, ${country}`,
    format: "json",
    limit: "1",
  });

  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: {
      "User-Agent": "OpenFX-MapPoster/0.1 (github.com/intpfx)",
    },
  });

  if (!res.ok) {
    throw new Error(`Geocoding failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { lat: string; lon: string }[];

  if (!data || data.length === 0) {
    throw new Error(`Could not find coordinates for ${city}, ${country}`);
  }

  const coord: Coord = {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
  };

  console.log(`\u2713 Coordinates: ${coord.lat}, ${coord.lon}`);

  // Save to cache
  try {
    const obj: Record<string, Coord> = {};
    try {
      const existing = await Bun.file(CACHE_PATH).text();
      Object.assign(obj, JSON.parse(existing));
    } catch {
      // Missing or invalid cache should not block fresh geocoding results.
    }
    obj[key] = coord;
    await Bun.write(CACHE_PATH, JSON.stringify(obj, null, 2));
  } catch {
    // non-critical
  }

  return coord;
}
