# OpenFX Agent Guide

## Mission

OpenFX is a personal collection monorepo.

It brings together small projects and active products — from experimental tools like
DenoKV storage services and edge storage nodes, to a Perry-compiled native desktop app
and a VitePlus + React + Nitro web stack. All live here, evolving together.

Agents working in this repo must optimize for long-term maintainability, testability,
and public readability.

## Principles

Follow the development principles in [README.md §开发原则](README.md).

## Preferred Workflow

1. Read `README.md` before making structural changes.
2. Load `.agents/skills/openfx-repo/SKILL.md` — the single project-level skill
   covering repo architecture, migration workflow, frontend patterns, deployment,
   and known pitfalls.
3. Update docs together with behavior changes.
4. Add or update tests when modifying `domains/downip`, `domains/proxy`,
   `domains/e`, `domains/how-much`, or `domains/_shared/tests`.

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
- The roadmap lives inside `README.md` as the default human-editable roadmap entrypoint.
- Architectural decisions also live inside `README.md` as the default human-readable
  record.
- Human-facing product copy should default to Simplified Chinese unless a task
  explicitly requires another language.
