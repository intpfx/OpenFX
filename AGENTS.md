# OpenFX Agent Guide

## Mission

OpenFX is a public monorepo with two first-party products:

- `apps/desktop`: a Perry-compiled native desktop application.
- `apps/web`: a Fresh application running on Deno and deployable to Deno Deploy.

Agents working in this repo must optimize for long-term maintainability, testability,
and public readability.

## Repository Principles

1. **Pure functions first**
   - Business logic belongs in `packages/core/src`.
   - Prefer stateless functions and explicit inputs/outputs.
   - Use classes only when a stateful lifecycle is materially clearer than pure data
     transforms.
2. **Side effects at the edges**
   - Disk IO, network IO, framework state, runtime bindings, and window lifecycle logic
     stay inside `apps/*`.
3. **Shared logic before duplication**
   - If both desktop and web need the same rule, move it into `packages/core`.
4. **Public OSS quality bar**
   - Write code and docs as if an external contributor will read them immediately.

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

## Documentation Rules

- `README.md` is the main entrypoint for humans.
- The roadmap lives inside `README.md` as the default human-editable roadmap entrypoint.
- Architectural decisions also live inside `README.md` as the default human-readable
  record.
- Human-facing product copy should default to Simplified Chinese unless a task
  explicitly requires another language.

## Knowledge Freshness

- External knowledge sources are indexed in `knowledge/sources.json`.
- Generated summaries live in `knowledge/index.generated.md`.
- Refresh with `deno task knowledge:refresh`.
- If guidance relies on evolving third-party tools, prefer updating the knowledge index
  before changing repo conventions.
