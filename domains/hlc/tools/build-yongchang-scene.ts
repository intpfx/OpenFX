const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CENTER = Object.freeze({ latitude: 31.6450428, longitude: 104.4166911 });
const RADIUS_METERS = 2600;

interface OsmElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

interface OsmResponse {
  elements: OsmElement[];
}

const query = `[out:json][timeout:60];(
way["highway"](around:${RADIUS_METERS},${CENTER.latitude},${CENTER.longitude});
way["building"](around:${RADIUS_METERS},${CENTER.latitude},${CENTER.longitude});
way["waterway"](around:${RADIUS_METERS},${CENTER.latitude},${CENTER.longitude});
way["natural"="water"](around:${RADIUS_METERS},${CENTER.latitude},${CENTER.longitude});
way["landuse"](around:${RADIUS_METERS},${CENTER.latitude},${CENTER.longitude});
way["leisure"](around:${RADIUS_METERS},${CENTER.latitude},${CENTER.longitude});
);out geom;`;

function option(name: string): string | null {
  const prefix = `--${name}=`;
  return Deno.args.find((argument) => argument.startsWith(prefix))?.slice(
    prefix.length,
  ) ?? null;
}

async function loadSource(): Promise<OsmResponse> {
  const input = option("input");
  if (input) return JSON.parse(await Deno.readTextFile(input)) as OsmResponse;

  const body = new URLSearchParams({ data: query });
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "OpenFX-HLC/0.1 (https://github.com/intpfx/OpenFX)",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Overpass request failed: ${response.status} ${await response.text()}`,
    );
  }
  return await response.json() as OsmResponse;
}

function classify(tags: Record<string, string>) {
  if (tags.highway) {
    const context = new Set([
      "motorway",
      "trunk",
      "primary",
      "primary_link",
      "secondary",
      "secondary_link",
    ]);
    const town = new Set([
      "tertiary",
      "tertiary_link",
      "residential",
      "living_street",
      "unclassified",
    ]);
    return {
      kind: "road",
      classification: tags.highway,
      lod: context.has(tags.highway)
        ? "context"
        : town.has(tags.highway)
        ? "town"
        : "detail",
    };
  }
  if (tags.natural === "water") {
    return {
      kind: "water",
      classification: tags.water || "water",
      lod: "context",
    };
  }
  if (tags.waterway) {
    return { kind: "waterway", classification: tags.waterway, lod: "context" };
  }
  if (tags.landuse || tags.leisure) {
    return {
      kind: "land",
      classification: tags.leisure || tags.landuse,
      lod: "context",
    };
  }
  if (tags.building) {
    return { kind: "building", classification: tags.building, lod: "detail" };
  }
  return null;
}

const roundCoordinate = (value: number) => Number(value.toFixed(7));

function normalizeCoordinates(geometry: NonNullable<OsmElement["geometry"]>) {
  const coordinates: [number, number][] = [];
  for (const point of geometry) {
    const coordinate: [number, number] = [
      roundCoordinate(point.lon),
      roundCoordinate(point.lat),
    ];
    const previous = coordinates.at(-1);
    if (
      !previous || previous[0] !== coordinate[0] ||
      previous[1] !== coordinate[1]
    ) {
      coordinates.push(coordinate);
    }
  }
  return coordinates;
}

const source = await loadSource();
const features = source.elements.flatMap((element) => {
  if (
    element.type !== "way" || !element.geometry || element.geometry.length < 2
  ) return [];
  const tags = element.tags ?? {};
  const classification = classify(tags);
  if (!classification) return [];
  const coordinates = normalizeCoordinates(element.geometry);
  if (coordinates.length < 2) return [];
  const first = coordinates[0];
  const last = coordinates.at(-1)!;
  return [{
    id: `way/${element.id}`,
    ...classification,
    name: tags.name || null,
    closed: first[0] === last[0] && first[1] === last[1],
    coordinates,
  }];
}).sort((left, right) => left.id.localeCompare(right.id));

const snapshot = {
  type: "OpenFXCommunityWorld",
  metadata: {
    name: "永昌镇老城区矢量骨架",
    center: CENTER,
    radiusMeters: RADIUS_METERS,
    coordinateSystem: "WGS84",
    snapshotDate: option("date") || new Date().toISOString().slice(0, 10),
    attribution: "© OpenStreetMap contributors",
    license: "ODbL 1.0",
    sourceUrl: "https://www.openstreetmap.org/node/5222769424",
    generator: "domains/hlc/tools/build-yongchang-scene.ts",
  },
  features,
};

const output = option("output") ||
  new URL("../source/data/yongchang-scene-data.js", import.meta.url).pathname;
await Deno.mkdir(new URL(".", `file://${output}`).pathname, {
  recursive: true,
});
await Deno.writeTextFile(
  output,
  `// Generated from OpenStreetMap. Run tools/build-yongchang-scene.ts to refresh.\n` +
    `export const YONGCHANG_SCENE_DATA = Object.freeze(${
      JSON.stringify(snapshot)
    });\n`,
);
console.log(`Wrote ${features.length} vector features to ${output}`);
