# OpenFX Node Native Graphics Memory Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Perry desktop core from continuously allocating native graphics resources and add a reproducible long-running memory gate for the packaged macOS app.

**Architecture:** Keep the persisted `reduceMotion` preference backward compatible, but derive an explicit effective motion policy at the desktop runtime boundary. Perry animation remains unavailable in production until a future runtime fix passes the long-run memory gate, so the core draws only on first visibility and node-state changes. A pure `vmmap` parser feeds an opt-in packaged-app smoke that samples the verified process for ten minutes.

**Tech Stack:** Deno 2, TypeScript, Perry 0.5.1220 native UI, macOS `vmmap`, Deno tests.

## Global Constraints

- Production must set `animatedCoreAvailable=false`; do not modify or upgrade the pinned Perry 0.5.1220 runtime patch in this fix.
- Effective production status must be `静态核心（Perry 稳定模式）`, with `mode: "static"`, `reduceMotion: true`, and `controlAvailable: false`.
- New preferences default to `reduceMotion: true`; an explicitly persisted `false` value must still parse as `false` and must not be rewritten merely because production forces the effective static policy.
- The unavailable animation control must not be actionable, while CPU and memory telemetry remain visible in the control panel.
- Static mode registers zero `onFrame` callbacks, ignores CPU/memory-only updates, redraws once per node-state change, draws nothing while hidden, and redraws once when reopened.
- The memory smoke must launch `dist/OpenFX Node.app`, bind samples to its token-verified PID, warm up for 30 seconds, then sample every 30 seconds for 10 minutes.
- From the post-warmup baseline, IOAccelerator region count may not increase, IOAccelerator virtual memory may grow by at most 64 MiB, and physical footprint may grow by at most 96 MiB.
- Keep the desktop stack Perry-first and Deno-native; introduce no Electron, Tauri, Node-only runtime assumption, or shell-interpolated process command.
- Human-facing product copy and documentation remain Simplified Chinese.

---

### Task 1: Force the Perry core onto a state-driven static render path

**Files:**
- Create: `entry/desktop/src/core/core-motion-policy.ts`
- Modify: `entry/desktop/src/core/desktop-state.ts`
- Modify: `entry/desktop/src/core/ui-model.ts`
- Modify: `entry/desktop/src/ui/control-panel.ts`
- Modify: `entry/desktop/src/ui/core-canvas.ts`
- Modify: `entry/desktop/src/main.ts`
- Modify: `entry/desktop/tests/ui-model.test.ts`
- Modify: `entry/desktop/tests/core-frame.test.ts`
- Modify: `entry/desktop/tests/desktop-contract.test.ts`
- Modify: `entry/desktop/README.md`
- Modify: `docs/openfx-console-architecture.md`
- Include: `docs/superpowers/plans/2026-07-21-openfx-node-memory-fix.md`

**Interfaces:**
- Produces: `deriveCoreMotionPolicy(requestedReduceMotion: boolean, animatedCoreAvailable: boolean): CoreMotionPolicy`.
- Produces: `CoreMotionPolicy` with exact fields `mode`, `reduceMotion`, `controlAvailable`, and `status`.
- Produces: control-panel presentation fields `motionStatus` and `motionControlAvailable`; `reduceMotion` represents the effective policy used by the visible control.

- [ ] **Step 1: Add failing motion-policy and preference migration tests**

Add focused assertions equivalent to:

```ts
assertEquals(deriveCoreMotionPolicy(false, false), {
  mode: "static",
  reduceMotion: true,
  controlAvailable: false,
  status: "静态核心（Perry 稳定模式）",
});
assertEquals(deriveCoreMotionPolicy(false, true).mode, "animated");
assertEquals(deriveCoreMotionPolicy(true, true).mode, "static");
assertEquals(DEFAULT_DESKTOP_PREFERENCES.reduceMotion, true);
assertEquals(sanitizeDesktopPreferences({}).reduceMotion, true);
assertEquals(sanitizeDesktopPreferences({ reduceMotion: false }).reduceMotion, false);
```

Also make the UI-model/control-panel tests require the production-stable status and unavailable control while retaining CPU and memory strings.

- [ ] **Step 2: Run the focused UI-model test and verify RED**

Run: `deno test --config entry/desktop/deno.json --allow-read --allow-write --allow-net --allow-run=deno entry/desktop/tests/ui-model.test.ts`

Expected: FAIL because `core-motion-policy.ts` and the effective policy fields do not exist, and because the old default is `false`.

- [ ] **Step 3: Implement the minimal pure policy and wire it through production**

Create the focused policy module with this behavior:

```ts
export type CoreMotion = "animated" | "static";

export interface CoreMotionPolicy {
  mode: CoreMotion;
  reduceMotion: boolean;
  controlAvailable: boolean;
  status: string;
}

export const PERRY_ANIMATED_CORE_AVAILABLE = false;

export const deriveCoreMotionPolicy = (
  requestedReduceMotion: boolean,
  animatedCoreAvailable: boolean,
): CoreMotionPolicy => animatedCoreAvailable
  ? {
    mode: requestedReduceMotion ? "static" : "animated",
    reduceMotion: requestedReduceMotion,
    controlAvailable: true,
    status: requestedReduceMotion ? "静态核心" : "动态核心",
  }
  : {
    mode: "static",
    reduceMotion: true,
    controlAvailable: false,
    status: "静态核心（Perry 稳定模式）",
  };
```

Use the policy in `main.ts` for `CoreCanvasMetrics.reduceMotion`; do not overwrite persisted preferences. Derive presentation state with `animatedCoreAvailable=false`. Hide/detach the reduce-motion toggle when `motionControlAvailable` is false and show the status caption instead; keep the action/type surface for future compatibility.

- [ ] **Step 4: Run the focused UI-model test and verify GREEN**

Run the Step 2 command.

Expected: PASS with the new policy, migration, presentation, and compatibility assertions.

- [ ] **Step 5: Add failing state-driven static renderer tests**

Add a renderer test that starts visible and static, applies 1,000 updates with the same node state but changing CPU/memory values, and asserts exactly one paint and zero frame-driver requests. Then change the node state and assert exactly one additional paint; hide, change state, assert no paint; reopen and assert exactly one paint.

- [ ] **Step 6: Run the focused renderer test and verify RED**

Run: `deno test --config entry/desktop/deno.json --allow-read --allow-write --allow-net --allow-run=deno entry/desktop/tests/core-frame.test.ts`

Expected: FAIL because static `update()` currently redraws on every telemetry update.

- [ ] **Step 7: Implement state-driven static invalidation**

In `createCoreCanvasRenderer.update`, compare the previous and next `state` before replacing metrics. In static mode, cancel any pending callback and draw only when no static frame has been drawn, motion just changed to static, or the node state changed. Do not schedule an `onFrame` callback in static mode. Preserve the existing animated code path for the future capability flag and preserve one redraw on reopening.

- [ ] **Step 8: Run focused and full desktop tests**

Run the Step 6 command, then:

`deno task --config entry/desktop/deno.json test`

Expected: the focused renderer tests and all desktop tests pass with no failures.

- [ ] **Step 9: Update behavior documentation**

Document in `entry/desktop/README.md` and `docs/openfx-console-architecture.md` that Perry 0.5.1220 currently uses the stable static core, telemetry continues independently, the persisted preference remains for forward compatibility, and animation can return only after the native memory gate passes.

- [ ] **Step 10: Commit Task 1**

```bash
git add docs/superpowers/plans/2026-07-21-openfx-node-memory-fix.md \
  entry/desktop/src entry/desktop/tests entry/desktop/README.md \
  docs/openfx-console-architecture.md
git commit -m "fix(desktop): disable unsafe Perry core animation"
```

---

### Task 2: Gate packaged-app native graphics memory growth

**Files:**
- Create: `entry/desktop/src/core/process-memory.ts`
- Create: `entry/desktop/tests/process-memory.test.ts`
- Modify: `entry/desktop/tools/desktop-app-smoke.ts`
- Modify: `entry/desktop/tests/macos-app-bundle.test.ts`
- Modify: `entry/desktop/deno.json`
- Modify: `deno.json`
- Modify: `entry/desktop/README.md`
- Modify: `docs/openfx-console-architecture.md`

**Interfaces:**
- Produces: `ProcessMemorySnapshot` with nullable `physicalFootprintBytes`, `ioAcceleratorVirtualBytes`, and `ioAcceleratorRegionCount`.
- Produces: `parseVmmapSummary(text: string): ProcessMemorySnapshot` with binary K/M/G unit conversion.
- Produces: root task `desktop:memory-smoke` and desktop task `memory-smoke`, both invoking the packaged-app smoke with `--memory`.

- [ ] **Step 1: Add failing `vmmap` parser tests**

Use fixtures covering K/M/G units, whitespace, an IOAccelerator summary row with a trailing region count, and missing fields. Require missing values to be `null`, not zero. Example expectations:

```ts
assertEquals(parseVmmapSummary(fixture), {
  physicalFootprintBytes: 34.7 * 1024 ** 3,
  ioAcceleratorVirtualBytes: 37.8 * 1024 ** 3,
  ioAcceleratorRegionCount: 381,
});
assertEquals(parseVmmapSummary("Physical footprint: 512M").ioAcceleratorRegionCount, null);
```

- [ ] **Step 2: Run the parser test and verify RED**

Run: `deno test --config entry/desktop/deno.json entry/desktop/tests/process-memory.test.ts`

Expected: FAIL because the parser module does not exist.

- [ ] **Step 3: Implement the pure parser**

Parse `Physical footprint:` independently of the IOAccelerator summary row. Convert K, M, and G with powers of 1024 and preserve decimal precision. Treat absent or malformed fields as `null`. Parse the IOAccelerator region count only from the row that supplies IOAccelerator virtual size.

- [ ] **Step 4: Run the parser test and verify GREEN**

Run the Step 2 command.

Expected: PASS for all unit, whitespace, malformed, and missing-field fixtures.

- [ ] **Step 5: Add failing task and smoke-contract tests**

Extend `macos-app-bundle.test.ts` to require:

```ts
assertEquals(
  rootConfig.tasks["desktop:memory-smoke"],
  "deno run -A entry/desktop/tools/desktop-app-smoke.ts --memory",
);
assertEquals(
  desktopConfig.tasks["memory-smoke"],
  "deno run -A tools/desktop-app-smoke.ts --memory",
);
```

Also require the smoke source to contain the exact warmup/sample durations and 64 MiB / 96 MiB limits.

- [ ] **Step 6: Run the contract test and verify RED**

Run: `deno test --config entry/desktop/deno.json --allow-read entry/desktop/tests/macos-app-bundle.test.ts`

Expected: FAIL because neither task nor memory-mode gate exists.

- [ ] **Step 7: Add opt-in memory mode to the packaged-app smoke**

Keep the existing normal smoke behavior unchanged. When `--memory` is present:

1. Launch the same `.app` through Launch Services with the unique token and marker paths.
2. Verify the marker PID, executable real path, `ps` command token, and `lsof` text mapping before sampling.
3. Wait for health, then warm up for exactly 30,000 ms.
4. Run `/usr/bin/vmmap -summary <verified pid>` once for the baseline and every 30,000 ms for 20 more samples.
5. Fail closed if any required snapshot field is `null`.
6. Compare the maximum sampled IOAccelerator region count and memory sizes to the post-warmup baseline. Require region delta `<= 0`, IOAccelerator virtual delta `<= 64 * 1024 ** 2`, and physical-footprint delta `<= 96 * 1024 ** 2`.
7. Print baseline, peak, final, and any failing snapshot in the final PASS/FAIL diagnostic.
8. Terminate only the token-verified PID through the existing bounded cleanup path and still require clean exit.

- [ ] **Step 8: Run parser, contract, and full desktop tests**

Run the Step 2 and Step 6 commands, then:

`deno task --config entry/desktop/deno.json test`

Expected: all desktop tests pass with no failures.

- [ ] **Step 9: Document the memory gate**

Add `deno task desktop:memory-smoke` to both desktop validation documents. State the 30-second warmup, 10-minute sampling window, sample interval, three exact thresholds, and that the task requires the verified pinned Perry runtime and packaged app.

- [ ] **Step 10: Commit Task 2**

```bash
git add deno.json entry/desktop/deno.json entry/desktop/src/core/process-memory.ts \
  entry/desktop/tests/process-memory.test.ts entry/desktop/tests/macos-app-bundle.test.ts \
  entry/desktop/tools/desktop-app-smoke.ts entry/desktop/README.md \
  docs/openfx-console-architecture.md
git commit -m "test(desktop): gate native graphics memory growth"
```

---

## Final Verification (controller-owned)

- `deno task --config entry/desktop/deno.json test`
- `deno task check`
- `perry check entry/desktop/src/main.ts --deep-deps`
- Fresh pinned Perry clone and `deno task perry:runtime --source /tmp/perry-openfx-memory-fix`
- `PERRY_LIB_DIR=/tmp/perry-openfx-memory-fix/target/openfx-v0.5.1220/release deno task desktop:app`
- `PERRY_LIB_DIR=/tmp/perry-openfx-memory-fix/target/openfx-v0.5.1220/release deno task desktop:app-smoke`
- `PERRY_LIB_DIR=/tmp/perry-openfx-memory-fix/target/openfx-v0.5.1220/release deno task desktop:memory-smoke`
- `git diff --check codex/openfx-console-freemac...HEAD`
