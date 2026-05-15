# OpenFX Roadmap

This file is intentionally editable by human maintainers.

Its purpose is to let humans steer product direction without needing to reverse-engineer
agent assumptions from code.

## Near term

- [ ] Establish the monorepo baseline for desktop, web, docs, and agent guidance
- [ ] Expand `packages/core` into a stable shared domain layer
- [ ] Add first meaningful end-user workflow shared across desktop and web
- [ ] Set up automated release packaging for the Perry desktop binary
- [ ] Wire the web app to a real Deno Deploy project

## Mid term

- [ ] Define plugin or extension boundaries if OpenFX grows beyond a single product
      surface
- [ ] Introduce stronger contract tests around shared core logic
- [ ] Add contributor-facing architectural decision records for major subsystems

## Long term

- [ ] Support richer synchronization between desktop and web surfaces
- [ ] Publish stable public APIs for reusable OpenFX modules
- [ ] Build contributor automation that stays aligned with the project-local skill and
      knowledge index

## Editing policy

- Humans may edit this file freely.
- Agents should treat this file as directional product input, not generated output.
- If implementation diverges from this roadmap, update the roadmap or create an ADR
  explaining why.
