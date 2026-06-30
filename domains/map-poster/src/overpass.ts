import type { Coord, GeoFeature } from "./types.ts";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const TIMEOUT = 30;
const MAX_RETRIES = 3;

interface OsmJson {
  version: number;
  elements: {
    type: string;
    id: number;
    tags?: Record<string, string>;
    geometry?: { lat: number; lon: number }[];
  }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildQuery(lat: number, lon: number, radius: number): string {
  return `[out:json][timeout:${TIMEOUT}];
(
  way["highway"](around:${radius},${lat},${lon});
  way["natural"~"water|bay|strait"](around:${radius},${lat},${lon});
  way["waterway"="riverbank"](around:${radius},${lat},${lon});
  way["leisure"~"park|garden|golf_course|nature_reserve"](around:${radius},${lat},${lon});
  way["landuse"~"grass|forest|recreation_ground|cemetery"](around:${radius},${lat},${lon});
);
out geom;`;
}

async function fetchOne(query: string, attempt = 0): Promise<OsmJson> {
  const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "OpenFX-MapPoster/0.1 (github.com/intpfx)" },
    signal: AbortSignal.timeout(TIMEOUT * 1000 + 5000),
  });

  if (res.ok) return (await res.json()) as OsmJson;

  // 400 can be "too many requests" disguised; retry with backoff
  if ((res.status === 429 || res.status === 400) && attempt < MAX_RETRIES) {
    const wait = 10_000 * Math.pow(2, attempt);
    console.log(
      `  \u23F3 Overpass busy, retry ${attempt + 1}/${MAX_RETRIES} in ${
        wait / 1000
      }s...`,
    );
    await sleep(wait);
    return fetchOne(query, attempt + 1);
  }

  const body = await res.text();
  throw new Error(
    `Overpass API error: HTTP ${res.status} — ${body.slice(0, 200)}`,
  );
}

function parseResponse(
  data: OsmJson,
): { roads: GeoFeature[]; water: GeoFeature[]; parks: GeoFeature[] } {
  const roads: GeoFeature[] = [];
  const water: GeoFeature[] = [];
  const parks: GeoFeature[] = [];

  for (const el of data.elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;

    const coords = el.geometry;
    let d = "";
    for (let i = 0; i < coords.length; i++) {
      d += `${i === 0 ? "M" : "L"}${coords[i].lon},${coords[i].lat}`;
    }
    const f = coords[0], l = coords[coords.length - 1];
    if (f.lat === l.lat && f.lon === l.lon) d += "Z";

    const tags = el.tags ?? {};
    const feat: GeoFeature = { d, bbox: [0, 0, 0, 0], tags };

    if (tags.highway) {
      const h = tags.highway;
      if (
        typeof h === "string" &&
        /^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|pedestrian|footway|cycleway|path|steps|track)$/
          .test(h)
      ) {
        roads.push(feat);
      }
    } else if (
      tags.natural === "water" || tags.natural === "bay" ||
      tags.natural === "strait" || tags.waterway === "riverbank"
    ) {
      water.push(feat);
    } else if (
      /^(park|garden|golf_course|nature_reserve)$/.test(tags.leisure ?? "") ||
      /^(grass|forest|recreation_ground|cemetery)$/.test(tags.landuse ?? "")
    ) {
      parks.push(feat);
    }
    // Everything else we ignore
  }

  return { roads, water, parks };
}

export interface FetchResult {
  roads: GeoFeature[];
  water: GeoFeature[];
  parks: GeoFeature[];
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
}

export async function fetchMapData(
  center: Coord,
  radiusMeters: number,
): Promise<FetchResult> {
  const radius = Math.ceil(radiusMeters);
  const query = buildQuery(center.lat, center.lon, radius);

  console.log(`  Fetching OSM data (${radius}m radius)...`);
  const raw = await fetchOne(query);
  const { roads, water, parks } = parseResponse(raw);
  console.log(
    `  \u2713 Roads: ${roads.length}, Water: ${water.length}, Parks: ${parks.length}`,
  );

  // Compute overall bbox
  let minLon = center.lon,
    maxLon = center.lon,
    minLat = center.lat,
    maxLat = center.lat;
  for (const feats of [roads, water, parks]) {
    for (const f of feats) {
      for (const tok of f.d.split(/[ML\s]/).filter(Boolean)) {
        const [ls, la] = tok.split(",");
        const lon = parseFloat(ls), lat = parseFloat(la);
        if (!isNaN(lon)) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
        }
        if (!isNaN(lat)) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
  }

  return { roads, water, parks, bbox: { minLon, maxLon, minLat, maxLat } };
}
