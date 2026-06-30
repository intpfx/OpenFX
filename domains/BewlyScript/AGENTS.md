# AGENTS.md

This file provides guidance when working with this BewlyScript domain.

## Project Overview

BewlyScript is the OpenFX userscript build of BewlyCat. It enhances Bilibili pages by bundling the content UI, page inject code, styles, and userscript compatibility shims into `dist/BewlyScript.user.js`.

## Development Environment

- Uses Bun as the package manager and TypeScript script runner.
- `bun install` installs dependencies from `bun.lock`.
- `bun run build:userscript` builds the installable userscript.
- `bun run check:userscript` runs typecheck, tests, and the userscript build.
- `bun run lint` runs ESLint.

## Build Scope

This domain is userscript-only. WebExtension packaging, popup/options pages, manifest generation, CRX/XPI/ZIP packaging, and extension-store submission are intentionally not part of the active build.

Do not reintroduce `hls.js` or `flv.js` for the userscript bundle unless the user explicitly chooses an external-loader strategy. Card previews rely only on native video playback now. Keep `qrcode.vue`; it supports the settings login QR code. Settings ordering uses explicit move controls, so do not reintroduce `vuedraggable` for that UI.

## Architecture Overview

- `src/contentScripts/` is the main app logic that runs on Bilibili pages.
- `src/inject/` contains scripts injected into the page context.
- `src/userscript/` contains metadata, GM/request adapters, browser-polyfill shim, and userscript-only host handling.
- `m.bilibili.com` is metadata coverage only: it must show the desktop-site fallback prompt at document-start and must not mount the Vue app shell.
- Complete mobile/portrait beautification is based on portrait-oriented `www.bilibili.com`, not the native m-site DOM.
- Reuse the old mobile work as responsive `www` behavior: safe-area chrome, bottom search/Dock, touch-first cards, mobile iframe drawers, and native desktop video-detail reflow.
- Do not route portrait `www.bilibili.com/video/...` into the old self-drawn `VideoDetail.vue`; keep the Bilibili desktop player and use `MOBILE_VIDEO_DETAIL_CSS` plus structure markers for layout.
- `src/background/messageListeners/`, `src/background/utils.ts`, and `src/background/wbiSign.ts` are reused by the userscript API dispatcher and should not be treated as removable extension-only code.
- `src/components/Settings/` is the in-page settings surface.
- `src/styles/adaptedStyles/` contains Bilibili page adaptation styles and should be preserved for broad Bilibili page compatibility.

## Important Files

- `scripts/build-userscript.ts` - Single-file userscript assembly.
- `vite.config.userscript.content.ts` - Content bundle build.
- `vite.config.userscript.inject.ts` - Inject bundle build.
- `src/contentScripts/index.ts` - Main page initialization.
- `src/userscript/browser-shim.ts` - WebExtension-compatible userscript runtime shim.
- `src/userscript/api-dispatcher.ts` - Same-page dispatcher that reuses the background API map.
- `src/logic/storage.ts` - Settings management.
- `src/utils/player.ts` - Video player enhancements.
- `src/_locales/` - I18n.

## Development Notes

- Use Vue 3 with Composition API and TypeScript.
- VitePlus/Rolldown builds the userscript content and inject bundles; Bun drives scripts and dependency management.
- UnoCSS is used for utility-first styling.
- Auto-imports are used for Vue and `webextension-polyfill`.
- The main app uses Shadow DOM for style isolation.
