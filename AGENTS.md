# OpenFX Agent Guide

## Mission

OpenFX is a personal collection monorepo.

It brings together small projects and active products — from experimental tools like
DenoKV storage services and edge storage nodes, to a Perry-compiled native desktop app
and a VitePlus + React + Nitro web stack. All live here, evolving together.

Agents working in this repo must optimize for long-term maintainability, testability,
and public readability.

## Principles

- **Readability**: Code and docs are public-facing — write for human readers, not just
  agents.
- **Pure functions first**: Business logic should be explicit, immutable data
  transformations.
- **OOP only when justified**: Only introduce object state when lifecycle or integration
  constraints make it clearly better.
- **Keep app layers thin**: Entrypoints (desktop/web) handle I/O, rendering, and runtime
  assembly only.
- **Docs are part of the product**: Structural changes must update documentation in the
  same change.

## Preferred Workflow

1. Read `README.md` before making structural changes.
2. Load `.agents/skills/openfx-repo/SKILL.md` — the project-level skill router and
   global guardrail layer.
3. Load the matching task skill from `.agents/skills/` before making code or docs
   changes.
4. Update docs together with behavior changes.
5. Add or update tests when modifying `domains/downip`, `domains/proxy`, `domains/e`,
   `domains/how-much`, or `domains/_shared/tests`.

## Project Skills

Task-specific details live in project skills. Choose the smallest matching set:

| Task                                                         | Skill                                             |
| ------------------------------------------------------------ | ------------------------------------------------- |
| Repository routing, global guardrails, validation baseline   | `.agents/skills/openfx-repo/SKILL.md`             |
| Web homepage, cards, panels, React, CSS, browser checks      | `.agents/skills/openfx-web-change/SKILL.md`       |
| Nitro routes, Deno Deploy, server handlers, shared runtime   | `.agents/skills/openfx-deno-nitro/SKILL.md`       |
| Old project migration into `domains/` or `_shared/`          | `.agents/skills/openfx-domain-migration/SKILL.md` |
| BewlyScript userscript, Bilibili boundaries, GM/browser shim | `.agents/skills/openfx-bewlyscript/SKILL.md`      |
| Map Poster renderer, map picking UI, OSM/poster API          | `.agents/skills/openfx-map-poster/SKILL.md`       |
| CI, Deno Deploy, build metadata, push/deploy verification    | `.agents/skills/openfx-release-deploy/SKILL.md`   |
| Repo structure, domain inventory, module boundaries          | `.agents/skills/openfx-repo-navigation/SKILL.md`  |
| `domains/e` agent framework core/app/foreground work         | `.agents/skills/openfx-agent-framework/SKILL.md`  |

## Stack Boundaries

- **Desktop**: Perry-first. Do not introduce Electron, Tauri, or Node-only runtime
  assumptions.
- **Web**: VitePlus + React on the client, Nitro on the server, Deno Deploy as the
  deploy target. Keep shared web logic runtime-safe across Nitro dev (Node) and Deno
  deploy output.
- **Tooling**: Prefer Deno-native tasks and built-ins where practical.

## External References

Consult official documentation before making stack-level assumptions:

- [Perry](https://docs.perryts.com/)
- [VitePlus](https://viteplus.dev/guide/)
- [Nitro](https://nitro.build/guide)
- [Deno](https://docs.deno.com/)
- [Deno Deploy](https://docs.deno.com/deploy/)
- [React](https://react.dev/)

## Documentation Rules

- `README.md` is the main entrypoint for humans.
- Human-facing product copy should default to Simplified Chinese unless a task
  explicitly requires another language.
