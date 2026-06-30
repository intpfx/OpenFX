---
name: openfx-bewlyscript
description: Use when changing the OpenFX BewlyScript userscript domain, Bilibili desktop/m-site boundary, userscript metadata, GM/browser shim, or generated userscript artifacts.
---

# OpenFX BewlyScript

Use this skill for `domains/BewlyScript` and its web install artifact.

## Product Boundary

- Active path is `domains/BewlyScript/`.
- Older `domains/bewlycat-userscript` mentions are historical only.
- OpenFX BewlyScript is based on `keleus/BewlyCat`, which itself is based on
  `BewlyBewly/BewlyBewly`.
- OpenFX maintains a Safari Userscripts / Tampermonkey single-file userscript.
- Full beautification targets the Bilibili desktop original site: `www.bilibili.com`.
- Portrait/narrow layout should still be desktop-site beautification.
- `m.bilibili.com` is metadata coverage for a document-start prompt asking the user to
  request the desktop site; do not mount the main Vue app there.
- Do not reintroduce WebExtension popup/options/manifest/store packaging as the OpenFX
  delivery surface.

## Key Files

- `domains/BewlyScript/AGENTS.md`
- `domains/BewlyScript/README.md`
- `domains/BewlyScript/package.json`
- `domains/BewlyScript/scripts/build-userscript.ts`
- `domains/BewlyScript/src/userscript/metadata.ts`
- `domains/BewlyScript/src/userscript/browser-shim.ts`
- `domains/BewlyScript/src/userscript/mobile-desktop-fallback.ts`
- `domains/BewlyScript/src/contentScripts/views/App.vue`
- `domains/BewlyScript/public/bewlyscript/BewlyScript.user.js`
- `entry/web/public/bewlyscript/BewlyScript.user.js`

## Rules

- Keep generated install artifacts synchronized when running the userscript build.
- If touching runtime behavior, check both the domain README and the OpenFX web
  card/panel copy for stale product claims.
- Do not replace the native Bilibili desktop player or route narrow desktop video pages
  into old self-drawn mobile video pages.
- Keep userscript changes isolated when the main OpenFX checkout is dirty or the bundle
  change is risky.

## Validation

From the domain:

```bash
cd domains/BewlyScript
bun run check:userscript
```

From the OpenFX root:

```bash
deno task check
deno task web:build
```

Use the domain check as the best single proof for userscript runtime changes; use the
root check to prove the monorepo baseline stayed green.
