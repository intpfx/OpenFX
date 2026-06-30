---
name: openfx-deno-nitro
description: Use when changing OpenFX Nitro routes, web server handlers, Deno Deploy behavior, environment variables, shared web/server runtime, or root Deno tooling.
---

# OpenFX Deno Nitro

Use this skill for server routes, API handlers, Deno Deploy compatibility, environment
variables, root Deno tasks, and shared web/server runtime code.

## Key Files

- `deno.json`: root tasks, workspace, imports, lint/fmt/test boundaries.
- `entry/web/deno.json`: web app Deno/VitePlus configuration.
- `entry/web/nitro.config.ts`: Nitro build/runtime configuration.
- `entry/web/vite.config.ts`: client build configuration and aliases.
- `entry/web/server/routes/`: Nitro route handlers.
- `entry/web/server/utils/`: route/runtime helpers.
- `entry/web/server/map-poster.ts`: Map Poster server adapter.
- `domains/_shared/`: shared Deno-safe modules.

## Rules

- Keep shared web logic safe across Nitro dev and Deno Deploy output.
- Vite aliases are available to the client build; Nitro route files should prefer proven
  relative imports unless the alias is configured for Nitro.
- Check import paths carefully in nested routes. Build is stricter than dev.
- Route handlers should stay thin: parse input, call domain/server helpers, return a
  small response.
- Public APIs should validate input and return stable error shapes.
- Do not add Node-only APIs to Deno Deploy routes unless they are isolated behind a
  build/runtime boundary.
- Update `entry/web/README.md` when adding externally visible routes or env vars.

## Common Routes

- `/api/health`
- `/api/messages`
- `/api/unlock`
- `/api/admin/*`
- `/api/how-much/*`
- `/api/map-poster/render`
- `/api/proxy/*`
- `/update`
- `/:key/*`

## Validation

```bash
deno task check
deno task web:build
```

For route-specific tests, add or update files under `entry/web/tests/`.
