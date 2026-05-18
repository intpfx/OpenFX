# OpenFX Agent Guide

## Mission

OpenFX is a public monorepo with two first-party products:

- `apps/desktop`: a Perry-compiled native desktop application.
- `apps/web`: a Fresh application running on Deno and deployable to Deno Deploy.

Agents working in this repo must optimize for long-term maintainability, testability,
and public readability.

## Principles

Follow the development principles in [README.md §开发原则](README.md).

## Preferred Workflow

1. Read `README.md` before making structural changes.
2. Read `.agents/skills/openfx-repo/SKILL.md` before making stack-level or
   agent-behavior changes.
3. Update docs together with behavior changes.
4. Add or update tests when modifying `packages/core`.

## Stack Boundaries

- **Desktop**: Perry-first. Do not introduce Electron, Tauri, or Node-only runtime
  assumptions.
- **Web**: Fresh + Deno + Vite plugin. Do not replace the runtime with Node-specific
  frameworks.
- **Tooling**: Prefer Deno-native tasks and built-ins where practical.

## External References

Consult official documentation before making stack-level assumptions:

- [Perry](https://docs.perryts.com/)
- [Fresh](https://fresh.deno.dev/docs)
- [Deno](https://docs.deno.com/)
- [Deno Deploy](https://docs.deno.com/deploy/)
- [Vite](https://vite.dev/guide/)

## Documentation Rules

- `README.md` is the main entrypoint for humans.
- The roadmap lives inside `README.md` as the default human-editable roadmap entrypoint.
- Architectural decisions also live inside `README.md` as the default human-readable
  record.
- Human-facing product copy should default to Simplified Chinese unless a task
  explicitly requires another language.
