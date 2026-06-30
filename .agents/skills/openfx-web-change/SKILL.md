---
name: openfx-web-change
description: Use when changing OpenFX web React, homepage cards, detail panels, styles, public assets, browser validation, or entry/web tests.
---

# OpenFX Web Change

Use this skill for `entry/web` client work: React, CSS, homepage project cards, detail
panels, public assets, browser checks, and web-facing tests.

## Key Files

- `entry/web/src/App.tsx`: homepage, panels, navigation, shared UI shell.
- `entry/web/src/styles.css`: homepage and panel styling.
- `entry/web/content/homepage-projects.json`: visible project card layout.
- `entry/web/homepage-projects.ts`: card data types and hidden-card helpers.
- `entry/web/homepage-panels.ts`: detail panel ID contract.
- `entry/web/tests/homepage-projects.test.ts`: card-to-panel contract.
- `entry/web/README.md`: web maintenance rules and runtime notes.

## Rules

- The first screen is the usable project browser, not a marketing landing page.
- Every card in `homepage-projects.json` must open a detail panel or embedded surface.
- When adding or renaming a card, update these together:
  - `entry/web/content/homepage-projects.json`
  - `entry/web/homepage-panels.ts`
  - the `activePanel === "<id>"` render branch in `App.tsx`
  - docs/tests when the card introduces a new workflow
- External GitHub repositories can be cards, but `sourcePath` must mark public/private
  status and the detail panel must explain whether OpenFX is only indexing the repo or
  actually hosting a runtime surface.
- Keep card text concise; detail panels carry the longer explanation.
- Build-version text is injected with `VITE_OPENFX_BUILD_TIME` and
  `VITE_OPENFX_BUILD_HASH`.
- Use generated/public assets only when the web server must serve them.

## Browser Validation

- Prefer the Codex in-app browser for local URLs.
- If unavailable, use Safari through Computer Use.
- Verify desktop and narrow/mobile viewports when layout, text wrapping, map/canvas, or
  panel density changed.

## Validation

Run for web/card/panel work:

```bash
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z VITE_OPENFX_BUILD_HASH=local00 deno task --config entry/web/deno.json build
deno task check
```

If a local preview is useful:

```bash
deno run -A entry/web/.output/server/index.ts
```

Then open `http://localhost:8000/`.
