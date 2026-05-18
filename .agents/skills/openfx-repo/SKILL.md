# OpenFX Repo Skill

Use this skill whenever working inside the OpenFX repository.

## Scope

This skill governs repository-local conventions for:

- `apps/desktop`
- `apps/web`
- `packages/core`
- repository docs and agent guidance

## Principles

Follow [README.md §开发原则](README.md) and [AGENTS.md](AGENTS.md).

## Tooling

- Desktop: Perry
- Web: Fresh + Deno + Vite
- Shared tests: Deno test runner

Do not replace these defaults casually. If a change is needed, add or update an ADR in
`README.md`.

## Reference Documentation

See [AGENTS.md §External References](AGENTS.md) for official documentation links.

## When writing code

- default to pure functions
- write tests for shared logic changes
- avoid hidden framework coupling in `packages/core`
- keep examples and starter code easy for contributors to understand
- default human-facing product copy and web UI text to Simplified Chinese unless
  explicitly requested otherwise
