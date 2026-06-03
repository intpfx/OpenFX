# OpenFX Desktop

This app is the native desktop surface for OpenFX.

## Goals

- compile to a single native binary with Perry
- keep UI orchestration thin
- move reusable business logic into `packages/core`

## Current integration scope

- Desktop-side DownIP client controls live in the GUI
- Server-side scripts are exposed as copyable deployment templates
- The macOS test artifact remains a single Perry GUI binary

## Build

```bash
perry compile apps/desktop/src/main.ts -o dist/openfx-desktop
```
