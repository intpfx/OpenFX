# Task 11 report

Status: complete with environment notes

## Outcome

- Added `HomepageFooterDock`, a presentational semantic footer with ordered
  left, middle, and right slots.
- Kept the location controller responsible for geolocation, poster rendering,
  object-URL cleanup, retry/dismissal, permission focus, and the live region.
- Routed normal location states through the Dock middle slot while keeping the
  permission gate, poster background, and suspended-panel attribution outside
  the Dock.
- Replaced the three independent desktop footer surfaces with one structural
  three-column rail and the mobile surfaces with two rows inside one fixed
  shell.
- Removed the obsolete fixed-location/status alignment and footer reservation
  rules. The command and proxy controls retain their existing behavior without
  independent outer shells.
- Updated the web README with Dock ownership, responsive layout, permission
  gate, and retained-poster attribution contracts.

## RED to GREEN

The required targeted command was first run before the component/API existed:

```text
deno test --allow-read=src/styles.css \
  tests/homepage-location-layout-contract.test.ts \
  tests/homepage-location-poster-view.test.tsx \
  tests/homepage-footer-dock.test.tsx
```

RED failed with nine expected TypeScript errors: the new
`HomepageFooterDock` module and the location controller's `renderStatus`
contract did not exist.

After implementation, that exact command reaches React 19.2.6 but Deno blocks
React's `NODE_ENV` read. The repository's own web test task already grants
`--allow-env`, so the corrected targeted command was:

```text
deno test --allow-env --allow-read=src/styles.css \
  tests/homepage-location-layout-contract.test.ts \
  tests/homepage-location-poster-view.test.tsx \
  tests/homepage-footer-dock.test.tsx
```

Result: 16 passed, 0 failed.

## Verification

- `deno task --config entry/web/deno.json test`
  - 181 passed, 0 failed, 1 ignored.
- `VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z
  VITE_OPENFX_BUILD_HASH=local00 deno task --config entry/web/deno.json build`
  - client and Nitro Deno Deploy builds completed; bounded Deno entry verified.
- `deno task check`
  - format, lint, Deno-only guard, 397 root web/domain tests, and 177 desktop
    tests passed; one KV integration test remained intentionally ignored.
- `git diff --check`
  - passed.

## Browser acceptance

The Codex in-app browser was unavailable, so acceptance used Safari Responsive
Design Mode as required by the fallback policy.

| Requested viewport | Safari effective viewport | Result |
| --- | --- | --- |
| 1440 x 900 | 1439 x 899 | One 1304 x 56 desktop rail; full city, OSM, relocation, count, search, and MESSAGE visible; no horizontal scroll. |
| 1024 x 768 | 1023 x 767 | One 927 x 56 desktop rail; middle and search shrink without overlap or horizontal scroll. |
| 901 x 844 | Safari reported 900 x 843 | Safari's RDM rounded this field to the mobile boundary; the adjacent 902 x 844 effective viewport verified the desktop side as one 806 x 56 rail. |
| 900 x 844 | 900 x 843 | One 868 x 99 fixed shell with two internal rows and 44px controls; no horizontal scroll. |
| 390 x 844 | 389 x 843 | One 357 x 99 fixed shell with two rows and 44px controls. A ready-state attribution width exposed 8px overflow; reducing the mobile attribution cap to 6rem removed the conflicting width while retaining city, OSM, and relocation controls. |

Additional state checks:

- MESSAGE switched the right slot to return, `MSG`, message input, and `SEND`
  without introducing another outer shell.
- The Map Poster detail panel suspended location controls, kept the generated
  background, exposed one retained OSM attribution, and left only the panel
  return control in the Dock.
- Long/error states are constrained by ellipsis and fixed row sizing; the
  render/CSS tests cover the same one-shell and fixed-height contracts.
- The permission gate remains a separate fixed, highest-layer dialog, and the
  Dock receives `inert` plus `aria-hidden` while it is active. Safari had
  already granted location permission for the tested origin, so this gate
  could not be freshly re-entered without changing browser permission state;
  its focus/attribution structure and z-index are covered by the updated view
  and CSS contract tests.

No demo mode, route, API, persistence field, dependency, server/domain behavior,
push, merge, or deployment was added.
