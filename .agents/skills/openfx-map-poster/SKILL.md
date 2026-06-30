---
name: openfx-map-poster
description: Use when changing OpenFX Map Poster, map picking UI, OSM/poster rendering, SVG/PNG generation, or the map-poster web API.
---

# OpenFX Map Poster

Use this skill for `domains/map-poster`, the web Map Poster card/panel, and
`/api/map-poster/render`.

## Product Boundary

- The implementation is based on `originalankur/maptoposter`.
- OpenFX rewrites the experience into a TypeScript/Deno web workflow with SVG rendering,
  preview, and download.
- The user selects the center point directly on the map; preset/manual coordinate entry
  should not be the primary interaction.
- `city` and `country` are poster title text. Coordinates are the source of truth when
  provided.

## Key Files

- `domains/map-poster/README.md`
- `domains/map-poster/src/`
- `domains/map-poster/test/`
- `entry/web/src/MapPosterPanel.tsx`
- `entry/web/server/map-poster.ts`
- `entry/web/server/routes/api/map-poster/render.post.ts`
- `entry/web/tests/map-poster.test.ts`
- `entry/web/public/map-poster/`
- `entry/web/content/homepage-projects.json`

## Rules

- Keep render logic deterministic and testable.
- Avoid network access in tests; use fixtures, presets, or map-picked coordinates.
- Keep SVG as the canonical generated artifact where possible; PNG download may be a
  browser/server conversion layer.
- Preserve source attribution and OpenFX differences in the web card/panel and README.
- If visual quality changes, compare generated output before and after.

## Validation

```bash
deno test --allow-env entry/web/tests/map-poster.test.ts
deno task check
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z VITE_OPENFX_BUILD_HASH=local00 deno task --config entry/web/deno.json build
```

For UI changes, run the preview server and verify the panel in a browser.
