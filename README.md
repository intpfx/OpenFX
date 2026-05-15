# OpenFX

OpenFX is a public TypeScript monorepo for two open-source products:

- a **desktop application** compiled by **Perry** into a single native binary for
  distribution
- a **web application** built with **Fresh** on **Deno**, suitable for deployment on
  **Deno Deploy**

The repository is intentionally optimized for **fast iteration**, **pure-function-first
domain logic**, and **human + agent collaboration**.

## Why this stack

### TypeScript everywhere

One language across desktop, web, and shared domain logic keeps iteration fast and
lowers maintenance cost.

### Perry for desktop

Perry fits the desktop requirement best because it compiles TypeScript directly into a
single native executable instead of shipping a browser runtime.

### Fresh + Deno for web

Fresh is the most natural fit for a Deno-native web app. It works well with Deno Deploy,
keeps the server/runtime model simple, and supports interactive islands only where
needed.

### Vite instead of Vite+

Vite+ is promising, but the repo baseline favors the more established and officially
documented path today. Fresh already documents a Vite-based workflow, so Vite is the
lower-risk public starting point.

## Repository layout

```text
apps/
  desktop/   Perry native desktop app
  web/       Fresh + Deno web app
packages/
  core/      shared pure domain logic and tests
docs/
  decisions/ architecture records
  ROADMAP.md human-steerable roadmap
.agents/
  skills/    project-local agent behavior
knowledge/
  sources.json
  index.generated.md
scripts/
  refresh-knowledge.ts
```

## Development principles

1. **Pure functions first**
   - Put business rules in `packages/core`.
   - Prefer explicit immutable data transforms.
2. **OO only when justified**
   - Use object-oriented state only when runtime lifecycle or integration constraints
     make it clearly better.
3. **Thin app shells**
   - `apps/desktop` and `apps/web` should mostly orchestrate IO, rendering, and runtime
     wiring.
4. **Docs are part of the product**
   - Structural changes should update docs in the same change set.

## Quick start

### Prerequisites

- [Deno](https://deno.com/)
- [Perry](https://docs.perryts.com/)
- [GitHub CLI](https://cli.github.com/) if you want to publish or manage the repo from
  the terminal

### Web app

```bash
deno task web:dev
```

Build for production:

```bash
deno task web:build
```

### Desktop app

```bash
perry compile apps/desktop/src/main.ts -o dist/openfx-desktop
```

### Validation

```bash
deno task check
```

## Roadmap

The roadmap is intentionally **human-editable** so maintainers can steer the project
directly.

See [docs/ROADMAP.md](docs/ROADMAP.md).

## Agent guidance

- Global repo guidance: [AGENTS.md](AGENTS.md)
- Project-local skill:
  [.agents/skills/openfx-repo/SKILL.md](.agents/skills/openfx-repo/SKILL.md)
- External knowledge index: [knowledge/index.generated.md](knowledge/index.generated.md)

## License

OpenFX uses **Apache-2.0**.

Reason: it stays permissive for open-source adoption while adding explicit patent
protection that is useful for a public application/platform repository.
