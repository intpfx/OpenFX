# OpenFX Repo Skill

Use this skill whenever working inside the OpenFX repository.

## Scope

This skill governs repository-local conventions for:

- `apps/desktop`
- `apps/web`
- `packages/core`
- repository docs and agent guidance

## Core rules

1. Put reusable business logic in `packages/core` as pure functions.
2. Keep `apps/*` focused on runtime integration, UI wiring, and side effects.
3. Prefer small, explicit data shapes over hidden mutable state.
4. Update documentation when changing architecture, tooling, or contribution norms.

## Tooling choices

- Desktop: Perry
- Web: Fresh + Deno + Vite
- Shared tests: Deno test runner

Do not replace these defaults casually. If a change is needed, add or update an ADR in
`docs/decisions/`.

## External knowledge policy

Use `knowledge/index.generated.md` as the repo-local cache of current official
references.

Primary sources are declared in `knowledge/sources.json` and refreshed by:

```bash
deno task knowledge:refresh
```

If the relevant knowledge is older than 14 days or clearly stale relative to the task,
refresh it before changing stack conventions.

## When writing code

- default to pure functions
- write tests for shared logic changes
- avoid hidden framework coupling in `packages/core`
- keep examples and starter code easy for contributors to understand
