---
name: openfx-agent-framework
description: Use when changing or analyzing OpenFX domains/e agent framework core, app adapters, foreground runtime, policies, tools, or tests.
---

# OpenFX Agent Framework

Use this skill for `domains/e`.

## Key Files

- `domains/e/src/core/`: pure kernels, policy, state, tools, queues, sessions.
- `domains/e/src/app/`: app-level runtime/adapters.
- `domains/e/src/foreground/`: foreground progress/runtime bridge.
- `domains/e/src/interfaces/`: injected runtime interfaces.
- `domains/e/tests/`: core/app/foreground tests.
- `domains/e/tests/fixtures/`: public contract fixtures.

## Rules

- Keep core behavior pure and explicit where practical.
- Prefer injected adapters for filesystem, model, git, MCP, and runtime side effects.
- Preserve workspace boundary and policy checks before adding new tool capabilities.
- Add or update tests with core or cross-file behavior changes.
- For external-framework comparisons, audit concept coverage against source code before
  claiming the idea is already absorbed.

## Validation

```bash
deno test --allow-env domains/e/tests
deno task check
```

For public type/fixture changes, update `domains/e/tests/fixtures/` and the matching
tests together.
