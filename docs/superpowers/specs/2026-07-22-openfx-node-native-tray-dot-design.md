# OpenFX Node Native Tray Dot Design

## Goal

Restore the original OpenFX Node menu-bar appearance: Perry's native solid-circle title
(`●`) instead of the packaged FX template image.

## Decision

`entry/desktop/src/ui/tray.ts` will call `trayCreate("")`. In the pinned Perry macOS
runtime, an empty icon path sets the status-item button title to `●`; this is the exact
implementation used before the FX image was introduced.

The repository will not keep an unused image pipeline. The tracked tray SVG/PNG, bundle
copy fields, SVG-to-PNG conversion, transparency inspection utility, packaged-resource
checks, and FX-specific documentation will be removed or rewritten. The application icon
remains unchanged.

## Scope

- Restore the empty-path Perry tray creation contract.
- Delete `entry/desktop/assets/openfx-tray-template.svg` and
  `entry/desktop/assets/openfx-tray-template.png`.
- Remove tray-image generation, copying, and validation from the macOS app builder.
- Remove the orphaned PNG-transparency helper after confirming it has no other caller.
- Update desktop contract, bundle, and smoke tests for the native-dot behavior.
- Update current architecture and desktop build documentation from “FX template icon” to
  “Perry native solid circle”. Historical implementation plans remain historical.
- Rebuild, verify, and relaunch the main-branch application.

## Runtime and packaging behavior

The tray menu, tooltip, actions, accessory activation policy, health server, Agent,
Relay, and event-driven system sampling remain unchanged. Only the status-item visual
source changes. The application bundle no longer contains a tray-specific image; its
ordinary application icon and `OpenFXNode.icns` remain in place.

## Verification

1. Focused tests require `trayCreate("")` and reject the obsolete tray-image pipeline.
2. Run the full repository check and Perry deep dependency check.
3. Build the signed `dist/OpenFX Node.app` with the pinned, provenance-verified Perry
   runtime.
4. Preserve a temporary rollback copy of the currently built bundle before replacing it.
5. Gracefully quit and verify the existing OpenFX Node PID before the real app smoke,
   avoiding a false health result from the old listener.
6. Run the packaged-app smoke, register the new bundle with Launch Services, and start
   exactly one daily instance.
7. Verify the executable path, port `24531`, `/v1/health`, and the visible menu-bar `●`.

If build or smoke verification fails, do not launch the candidate as the daily instance.
The temporary rollback bundle remains available until the new instance and visible icon
are confirmed.

## Non-goals

- No Deno Desktop migration in this change.
- No change to the Dock/application icon.
- No new tray artwork, animation, state colors, or badges.
- No changes to node protocol, pairing, Relay, Agent, or monitoring behavior.
