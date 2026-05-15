# OpenFX Desktop

This app is the native desktop surface for OpenFX.

## Goals

- compile to a single native binary with Perry
- keep UI orchestration thin
- move reusable business logic into `packages/core`

## Build

```bash
perry compile apps/desktop/src/main.ts -o dist/openfx-desktop
```
