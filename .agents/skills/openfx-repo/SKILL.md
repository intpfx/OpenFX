---
name: openfx-repo
description: OpenFX monorepo entrypoint. Use in this repo to choose the right project skill, understand global boundaries, and keep docs/tests aligned.
---

# OpenFX Repo

Use this skill first for OpenFX repository work. It is the router and global guardrail
layer; task-specific details live in sibling skills.

## Skill Routing

Read the matching skill after this entrypoint:

| Task                                                                       | Skill                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------- |
| Web homepage, cards, panels, React, CSS, browser checks                    | `.agents/skills/openfx-web-change/SKILL.md`       |
| Nitro routes, server handlers, Deno Deploy, shared web/server runtime      | `.agents/skills/openfx-deno-nitro/SKILL.md`       |
| Migrating old/local projects into `domains/` or `_shared/`                 | `.agents/skills/openfx-domain-migration/SKILL.md` |
| BewlyScript userscript packaging, Bilibili boundaries, shim/runtime work   | `.agents/skills/openfx-bewlyscript/SKILL.md`      |
| Map Poster renderer, OSM data, poster API, web generator                   | `.agents/skills/openfx-map-poster/SKILL.md`       |
| CI, Deno Deploy, release/push/deployment verification                      | `.agents/skills/openfx-release-deploy/SKILL.md`   |
| Repository structure, module boundaries, domain inventory, code navigation | `.agents/skills/openfx-repo-navigation/SKILL.md`  |
| `domains/e` agent framework core/app/foreground work                       | `.agents/skills/openfx-agent-framework/SKILL.md`  |

If a task spans multiple areas, load the smallest set of skills that covers the work.

## Global Rules

- Read `README.md` and `AGENTS.md` before structural changes.
- Keep public docs readable; human-facing product copy defaults to Simplified Chinese.
- Prefer pure functions, immutable transformations, explicit runtime boundaries, and
  thin app entrypoints.
- Do not introduce Electron, Tauri, or Node-only assumptions into the desktop stack.
- Web is VitePlus + React + Nitro, with Deno Deploy as the deployment target.
- Prefer Deno-native tooling at the repository root. Some domains have their own tools;
  use the domain skill or README before running package-manager commands.
- Update docs with behavior changes.
- Add or update tests when touching `domains/downip`, `domains/proxy`, `domains/e`,
  `domains/how-much`, `entry/web/tests`, or `domains/_shared/tests`.

## Validation Baseline

Use the narrowest proof that covers the touched area, then run broader checks when the
change crosses boundaries:

```bash
deno task check
deno task web:build
```

For web production-build checks that need deterministic version text:

```bash
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z VITE_OPENFX_BUILD_HASH=local00 deno task --config entry/web/deno.json build
```

## Reference Policy

`references/` under this skill is historical support material, not the main operating
surface. Open a reference only when the selected skill explicitly points to it or the
task needs that history.

Current references:

- `animejs-api-v4.md`
- `animation-cleanup-race.md`
- `css-conflict-diagnostics.md`
- `nitro-import-path-table.md`
- `sse-streaming-pattern.md`

Historical or partially stale references:

- `fresh-architecture.md`
- `agent-guidance-restructure.md`
- `project-migration-workflow.md`
- `esn-extraction-patterns.md`

Do not treat stale references as current implementation truth without verifying source
files.
