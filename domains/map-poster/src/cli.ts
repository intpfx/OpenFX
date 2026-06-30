#!/usr/bin/env bun
/**
 * Map Poster CLI
 *
 * Generate beautiful minimalist map posters from OpenStreetMap data.
 *
 * Usage:
 *   bun run src/cli.ts --city Tokyo --country Japan
 *   bun run src/cli.ts --city "New York" --country "USA" --theme midnight_blue
 *   bun run src/cli.ts --city Tokyo --country Japan --format png
 *   bun run src/cli.ts --list-themes
 */

import { geocode } from "./geocoding.ts";
import { fetchMapData } from "./overpass.ts";
import { renderSvg } from "./renderer.ts";
import { getTheme, listThemes } from "./themes.ts";

const OUTPUT_DPI = 300;

const HELP = `
Map Poster Generator — from OpenStreetMap to beautiful SVG posters

Usage:
  bun run src/cli.ts --city <city> --country <country> [options]

Options:
  --city, -c <name>         City name (required)
  --country, -C <name>      Country name (required)
  --lat, --latitude <deg>   Override latitude
  --lon, --longitude <deg>  Override longitude
  --theme, -t <name>        Theme name (default: terracotta)
  --distance, -d <meters>   Map radius in meters (default: 15000)
  --width, -W <inches>      Poster width in inches (default: 12)
  --height, -H <inches>     Poster height in inches (default: 16)
  --format, -f <fmt>        Output format: svg, png (default: svg)
  --list-themes             List all available themes
  --help, -h                Show this help

Examples:
  bun run src/cli.ts --city Tokyo --country Japan
  bun run src/cli.ts --city "New York" --country "USA" --theme midnight_blue
  bun run src/cli.ts --city Paris --country France --format png
  bun run src/cli.ts --list-themes
`;

interface Args {
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  theme: string;
  distance: number;
  width: number;
  height: number;
  format: "svg" | "png";
  listThemes: boolean;
  help: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    theme: "terracotta",
    distance: 15000,
    width: 12,
    height: 16,
    format: "svg",
    listThemes: false,
    help: false,
  };

  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    const next = () => raw[i + 1];

    switch (arg) {
      case "--city":
      case "-c":
        args.city = next();
        i++;
        break;
      case "--country":
      case "-C":
        args.country = next();
        i++;
        break;
      case "--lat":
      case "--latitude":
        args.latitude = parseFloat(next());
        i++;
        break;
      case "--lon":
      case "--longitude":
        args.longitude = parseFloat(next());
        i++;
        break;
      case "--theme":
      case "-t":
        args.theme = next();
        i++;
        break;
      case "--distance":
      case "-d":
        args.distance = parseInt(next());
        i++;
        break;
      case "--width":
      case "-W":
        args.width = parseFloat(next());
        i++;
        break;
      case "--height":
      case "-H":
        args.height = parseFloat(next());
        i++;
        break;
      case "--format":
      case "-f": {
        const val = next() as string;
        if (val !== "svg" && val !== "png") {
          throw new Error(`Invalid format: ${val}`);
        }
        args.format = val;
        i++;
        break;
      }
      case "--list-themes":
        args.listThemes = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

async function main() {
  const args = parseArgs();

  if (args.help || (process.argv.length <= 2)) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.listThemes) {
    const themes = listThemes();
    console.log("\nAvailable themes:");
    for (const name of themes) {
      const theme = getTheme(name);
      if (theme) console.log(`  ${name} — ${theme.description}`);
    }
    console.log();
    process.exit(0);
  }

  if (!args.city || !args.country) {
    console.error("Error: --city and --country are required.");
    console.log(HELP);
    process.exit(1);
  }

  // Resolve coordinates
  let lat: number, lon: number;
  if (args.latitude !== undefined && args.longitude !== undefined) {
    lat = args.latitude;
    lon = args.longitude;
    console.log(`\u2713 Using provided coordinates: ${lat}, ${lon}`);
  } else {
    const coord = await geocode(args.city, args.country);
    lat = coord.lat;
    lon = coord.lon;
  }

  // Load theme
  const theme = getTheme(args.theme);
  if (!theme) {
    console.error(`Error: Theme "${args.theme}" not found.`);
    console.log(`Available themes: ${listThemes().join(", ")}`);
    process.exit(1);
  }
  console.log(`\u2713 Theme: ${theme.name} — ${theme.description}`);

  // Fetch OSM data
  console.log("\nFetching OpenStreetMap data...");
  const data = await fetchMapData({ lat, lon }, args.distance);

  // Render SVG
  console.log("\nRendering poster...");
  const posterWidth = Math.round(args.width * OUTPUT_DPI);
  const posterHeight = Math.round(args.height * OUTPUT_DPI);
  const svg = renderSvg(data, { lat, lon }, theme, posterWidth, posterHeight, {
    city: args.city,
    country: args.country,
    distanceMeters: args.distance,
  });

  // Output
  const citySlug = args.city.toLowerCase().replace(/\s+/g, "_");
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `posters/${citySlug}_${args.theme}_${timestamp}`;

  if (args.format === "svg") {
    const outPath = `${filename}.svg`;
    await Bun.write(outPath, svg);
    console.log(`\u2713 Saved: ${outPath}`);
  } else if (args.format === "png") {
    try {
      const sharp = await import("sharp");
      const outPath = `${filename}.png`;
      const buf = Buffer.from(svg);
      await sharp.default(buf)
        .png({ compressionLevel: 9 })
        .withMetadata({ density: OUTPUT_DPI })
        .toFile(outPath);
      console.log(`\u2713 Saved: ${outPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `Warning: PNG export failed (${message}), falling back to SVG.`,
      );
      const outPath = `${filename}.svg`;
      await Bun.write(outPath, svg);
      console.log(`\u2713 Saved: ${outPath}`);
    }
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
