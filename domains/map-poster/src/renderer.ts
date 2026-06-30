import type { Coord, Theme } from "./types.ts";
import type { FetchResult } from "./overpass.ts";

export interface RenderOptions {
  city: string;
  country: string;
  displayCity?: string;
  displayCountry?: string;
  distanceMeters?: number;
}

interface RoadSpec {
  color: string;
  width: number;
  opacity: number;
  order: number;
}

interface PathCommand {
  cmd: "M" | "L" | "Z";
  lon?: number;
  lat?: number;
}

const EARTH_RADIUS_METERS = 6_378_137;

function roadSpec(
  hwy: string | string[] | undefined,
  t: Theme,
  scale: number,
): RoadSpec {
  const h = !hwy ? "" : (Array.isArray(hwy) ? hwy[0] : hwy);
  switch (h) {
    case "motorway":
    case "motorway_link":
      return {
        color: t.roadMotorway,
        width: 5.2 * scale,
        opacity: 0.88,
        order: 5,
      };
    case "trunk":
    case "trunk_link":
    case "primary":
    case "primary_link":
      return {
        color: t.roadPrimary,
        width: 4.0 * scale,
        opacity: 0.76,
        order: 4,
      };
    case "secondary":
    case "secondary_link":
      return {
        color: t.roadSecondary,
        width: 3.0 * scale,
        opacity: 0.62,
        order: 3,
      };
    case "tertiary":
    case "tertiary_link":
      return {
        color: t.roadTertiary,
        width: 2.1 * scale,
        opacity: 0.48,
        order: 2,
      };
    case "residential":
    case "living_street":
    case "unclassified":
      return {
        color: t.roadResidential,
        width: 1.25 * scale,
        opacity: 0.34,
        order: 1,
      };
    case "service":
      return {
        color: t.roadDefault,
        width: 0.85 * scale,
        opacity: 0.20,
        order: 0,
      };
    default:
      return {
        color: t.roadDefault,
        width: 1.05 * scale,
        opacity: 0.26,
        order: 0,
      };
  }
}

function parsePath(d: string): PathCommand[] {
  const cmds = d.match(/[MLZ][^MLZ]*/g);
  if (!cmds) return [];

  const out: PathCommand[] = [];
  for (const raw of cmds) {
    const cmd = raw[0] as "M" | "L" | "Z";
    if (cmd === "Z") {
      out.push({ cmd });
      continue;
    }

    const [lonText, latText] = raw.slice(1).trim().split(",");
    const lon = Number.parseFloat(lonText);
    const lat = Number.parseFloat(latText);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      out.push({ cmd, lon, lat });
    }
  }
  return out;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isLatinScript(text: string): boolean {
  let latin = 0;
  let alpha = 0;

  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    alpha += 1;
    if (ch.codePointAt(0)! < 0x250) latin += 1;
  }

  return alpha === 0 || latin / alpha > 0.8;
}

function formatCityName(name: string): string {
  if (!isLatinScript(name)) return name;
  return name.toUpperCase().split("").join("  ");
}

function formatCountryName(name: string): string {
  return isLatinScript(name) ? name.toUpperCase() : name;
}

export function renderSvg(
  data: FetchResult,
  center: Coord,
  theme: Theme,
  pw: number,
  ph: number,
  opts: RenderOptions,
): string {
  const posterAspect = pw / ph;
  const lat0 = center.lat * Math.PI / 180;
  const meter = (lon: number, lat: number): [number, number] => [
    EARTH_RADIUS_METERS * (lon * Math.PI / 180) * Math.cos(lat0),
    EARTH_RADIUS_METERS * (lat * Math.PI / 180),
  ];
  const [centerX, centerY] = meter(center.lon, center.lat);

  const defaultRadius = Math.max(
    Math.abs(meter(data.bbox.minLon, center.lat)[0] - centerX),
    Math.abs(meter(data.bbox.maxLon, center.lat)[0] - centerX),
    Math.abs(meter(center.lon, data.bbox.minLat)[1] - centerY),
    Math.abs(meter(center.lon, data.bbox.maxLat)[1] - centerY),
    1,
  );
  const radius = opts.distanceMeters ?? defaultRadius;
  const halfX = posterAspect >= 1 ? radius : radius * posterAspect;
  const halfY = posterAspect >= 1 ? radius / posterAspect : radius;
  const minX = centerX - halfX;
  const maxX = centerX + halfX;
  const minY = centerY - halfY;
  const maxY = centerY + halfY;

  const prj = (lon: number, lat: number): [number, number] => {
    const [x, y] = meter(lon, lat);
    return [
      ((x - minX) / (maxX - minX)) * pw,
      ((maxY - y) / (maxY - minY)) * ph,
    ];
  };

  const reproject = (d: string): string => {
    const cmds = parsePath(d);
    if (cmds.length === 0) return "";
    const out: string[] = [];
    for (const cmd of cmds) {
      if (cmd.cmd === "Z") {
        out.push("Z");
        continue;
      }
      const [px, py] = prj(cmd.lon!, cmd.lat!);
      out.push(`${cmd.cmd}${px.toFixed(2)},${py.toFixed(2)}`);
    }
    return out.join("");
  };

  const base = Math.min(pw, ph);
  const strokeScale = base / 3600;
  const cityName = formatCityName(opts.displayCity || opts.city);
  const countryName = opts.displayCountry || opts.country;

  const groups = new Map<string, { spec: RoadSpec; paths: string[] }>();
  for (const f of data.roads) {
    const s = roadSpec(f.tags?.highway, theme, strokeScale);
    const path = reproject(f.d).replace(/Z$/, "");
    if (!path) continue;
    const key = `${s.color}_${s.width}_${s.opacity}_${s.order}`;
    if (!groups.has(key)) groups.set(key, { spec: s, paths: [] });
    groups.get(key)!.paths.push(path);
  }
  const roads = [...groups.values()].sort((a, b) => a.spec.order - b.spec.order);

  const titleSize = Math.round(base * 0.066);
  const subtitleSize = Math.round(base * 0.024);
  const coordSize = Math.round(base * 0.014);
  const attrSize = Math.max(9, Math.round(base * 0.009));
  const sepLen = Math.round(base * 0.135);
  const titleY = Math.round(ph * 0.858);
  const sepY = Math.round(ph * 0.890);
  const subY = Math.round(ph * 0.924);
  const coordY = Math.round(ph * 0.958);
  const cx = pw / 2;
  const coordText = `${Math.abs(center.lat).toFixed(4)}° ${
    center.lat >= 0 ? "N" : "S"
  } / ${Math.abs(center.lon).toFixed(4)}° ${center.lon >= 0 ? "E" : "W"}`;

  const polygonPaths = (features: typeof data.water) =>
    features.map((f) => reproject(f.d)).filter(Boolean);

  const waterPaths = polygonPaths(data.water);
  const parkPaths = polygonPaths(data.parks);

  const L: string[] = [];
  L.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  L.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}">`,
  );
  L.push(`<defs>`);
  L.push(
    `<clipPath id="poster-clip"><rect width="${pw}" height="${ph}"/></clipPath>`,
  );
  L.push(`<linearGradient id="fade-top" x1="0" y1="0" x2="0" y2="1">`);
  L.push(
    `<stop offset="0%" stop-color="${theme.gradientColor}" stop-opacity="1"/>`,
  );
  L.push(
    `<stop offset="44%" stop-color="${theme.gradientColor}" stop-opacity="0.72"/>`,
  );
  L.push(
    `<stop offset="100%" stop-color="${theme.gradientColor}" stop-opacity="0"/>`,
  );
  L.push(`</linearGradient>`);
  L.push(`<linearGradient id="fade-bottom" x1="0" y1="1" x2="0" y2="0">`);
  L.push(
    `<stop offset="0%" stop-color="${theme.gradientColor}" stop-opacity="1"/>`,
  );
  L.push(
    `<stop offset="42%" stop-color="${theme.gradientColor}" stop-opacity="0.90"/>`,
  );
  L.push(
    `<stop offset="78%" stop-color="${theme.gradientColor}" stop-opacity="0.20"/>`,
  );
  L.push(
    `<stop offset="100%" stop-color="${theme.gradientColor}" stop-opacity="0"/>`,
  );
  L.push(`</linearGradient>`);
  L.push(`</defs>`);
  L.push(`<rect width="100%" height="100%" fill="${theme.bg}"/>`);
  L.push(`<g clip-path="url(#poster-clip)">`);

  if (waterPaths.length > 0) {
    L.push(`<g fill="${theme.water}" stroke="none" opacity="0.92">`);
    for (const p of waterPaths) L.push(`<path d="${p}"/>`);
    L.push(`</g>`);
  }

  if (parkPaths.length > 0) {
    L.push(`<g fill="${theme.parks}" stroke="none" opacity="0.72">`);
    for (const p of parkPaths) L.push(`<path d="${p}"/>`);
    L.push(`</g>`);
  }

  for (const group of roads) {
    const { spec: s, paths } = group;
    L.push(
      `<g fill="none" stroke="${s.color}" stroke-width="${
        s.width.toFixed(2)
      }" stroke-linecap="round" stroke-linejoin="round" opacity="${s.opacity}">`,
    );
    for (const p of paths) L.push(`<path d="${p}"/>`);
    L.push(`</g>`);
  }

  L.push(`</g>`);
  L.push(
    `<rect x="0" y="0" width="${pw}" height="${
      Math.round(ph * 0.20)
    }" fill="url(#fade-top)"/>`,
  );
  L.push(
    `<rect x="0" y="${Math.round(ph * 0.62)}" width="${pw}" height="${
      Math.round(ph * 0.38)
    }" fill="url(#fade-bottom)"/>`,
  );

  L.push(
    `<g text-anchor="middle" font-family="Roboto, Inter, Arial, Helvetica, sans-serif">`,
  );
  L.push(
    `<text x="${cx}" y="${titleY}" font-size="${titleSize}" fill="${theme.text}" font-weight="700">${
      escapeXml(cityName)
    }</text>`,
  );
  L.push(
    `<line x1="${cx - sepLen / 2}" y1="${sepY}" x2="${
      cx + sepLen / 2
    }" y2="${sepY}" stroke="${theme.text}" stroke-width="${
      Math.max(1, strokeScale * 3).toFixed(2)
    }" opacity="0.46"/>`,
  );
  L.push(
    `<text x="${cx}" y="${subY}" font-size="${subtitleSize}" fill="${theme.text}" font-weight="300" opacity="0.78" letter-spacing="${
      Math.max(1, strokeScale * 7).toFixed(2)
    }">${escapeXml(formatCountryName(countryName))}</text>`,
  );
  L.push(
    `<text x="${cx}" y="${coordY}" font-size="${coordSize}" fill="${theme.text}" opacity="0.50" letter-spacing="${
      Math.max(0.8, strokeScale * 3).toFixed(2)
    }">${escapeXml(coordText)}</text>`,
  );
  L.push(
    `<text x="${pw - base * 0.018}" y="${
      ph - base * 0.018
    }" font-size="${attrSize}" fill="${theme.text}" opacity="0.42" text-anchor="end">© OpenStreetMap contributors</text>`,
  );
  L.push(`</g>`);
  L.push(`</svg>`);
  return L.join("\n");
}
