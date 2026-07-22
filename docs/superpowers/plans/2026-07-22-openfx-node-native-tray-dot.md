# OpenFX Node Native Tray Dot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore OpenFX Node's exact Perry-native menu-bar `●`, remove the now-orphaned
tray-image pipeline, and replace the currently running local app with a verified
main-branch build.

**Architecture:** Keep the existing Perry tray/menu lifecycle and pass an empty icon
path to `trayCreate`; the pinned Perry macOS runtime turns that empty path into the
native `●` title. Remove image-specific state from source, packaging, smoke checks, and
current documentation while preserving the application icon, node runtime, menu actions,
and memory controls.

**Tech Stack:** Deno 2.x tasks and tests, TypeScript, Perry 0.5.1220 native macOS UI,
macOS app bundles and Launch Services, zsh operational checks.

## Global Constraints

- Execute from `/Users/siaovon/Documents/OpenFX` on `main`. This is a small, isolated
  restoration and the user explicitly wants only the local `main` branch retained, so do
  not create another branch or worktree.
- Before editing, require a clean `git status --short` except for this plan commit. Stop
  if unrelated changes appear; in particular, do not alter the restored Finlyzer icons.
- Follow the approved design in
  `docs/superpowers/specs/2026-07-22-openfx-node-native-tray-dot-design.md`.
- Preserve `entry/web/public/openfx-icon-512.png`, generated `OpenFXNode.icns`, the
  Dock/application icon, tray menu labels/actions, activation policy, port `24531`,
  Agent, Relay, and event-driven sampling.
- Do not change the pinned Perry source, its patch, runtime provenance, memory
  thresholds, or migrate to Deno Desktop in this change.
- Use test-first RED→GREEN sequencing for the source and packaging contract. Do not
  weaken unrelated desktop smoke or memory assertions.
- Build and smoke with the provenance-verified runtime at
  `/tmp/perry-openfx-clean.Nupvg9/Perry/target/openfx-v0.5.1220/release`. If that
  directory no longer exists or fails provenance validation, rebuild it through
  `deno task perry:runtime` rather than silently selecting another Perry checkout.
- Keep a recoverable copy of the current `dist/OpenFX Node.app` until the new process,
  health endpoint, menu actions, and visible `●` have all been verified.

---

### Task 1: Lock the native-dot and asset-removal contracts

**Files:**

- Modify: `entry/desktop/tests/desktop-contract.test.ts`
- Modify: `entry/desktop/tests/macos-app-bundle.test.ts`

- [ ] **Step 1: Confirm the starting state and exact obsolete references**

Run:

```bash
cd /Users/siaovon/Documents/OpenFX
git status --short --branch
rg -n "TRAY_ICON_PATH|trayIcon|openfx-tray-template|png-transparency|assertTransparentTrayIcon" entry/desktop
```

Expected: `main` has no uncommitted implementation changes; references appear only in
the current tray source, macOS builder, app smoke, the PNG utility, and the two contract
suites identified by the design.

- [ ] **Step 2: Change the desktop source contract to require the native empty-path
      API**

In `entry/desktop/tests/desktop-contract.test.ts`, make the launch-mode contract require
the literal native-dot contract and reject the removed constant:

```ts
assert(source.includes('trayCreate("")'));
assertEquals(source.includes("TRAY_ICON_PATH"), false);
```

In the desktop-label/menu contract, replace the old negative assertion with:

```ts
assert(source.includes('trayCreate("")'));
```

In the packaged-app smoke contract, replace the positive tray-PNG assertions with
explicit absence checks while retaining the app icon and screenshot assertions:

```ts
assertEquals(
  smoke.includes("Contents/Resources/openfx-tray-template.png"),
  false,
);
assertEquals(smoke.includes("assertTransparentTrayIcon"), false);
assertEquals(smoke.includes("assertNonEmptyFile(TRAY_ICON)"), false);
assertEquals(smoke.includes("inspectPngTransparency"), false);
```

- [ ] **Step 3: Replace the PNG decoder test with a packaging-boundary test**

In `entry/desktop/tests/macos-app-bundle.test.ts`:

1. Add `assertRejects` to the `@std/assert` import.
2. Remove `trayIconDestination` from `BuildToolModule.createMacAppPlan`'s return type
   and from the canonical-layout assertions.
3. Delete `DecodedRgbaPng`, `decodeRgbaPng`, `unfilterByte`, `paeth`, and `readUint32`;
   they have no non-tray purpose.
4. Replace `desktop resources include a tracked transparent FX template icon` with this
   contract:

```ts
Deno.test("macOS app uses Perry's native tray dot without image assets", async () => {
  const builder = await loadBuildTool();
  const plan = builder.createMacAppPlan("/repo", "/perry/release");
  const buildSource = await Deno.readTextFile(BUILD_TOOL_URL);
  const smokeSource = await Deno.readTextFile(
    join(REPOSITORY_ROOT, "entry/desktop/tools/desktop-app-smoke.ts"),
  );
  const traySource = await Deno.readTextFile(
    join(REPOSITORY_ROOT, "entry/desktop/src/ui/tray.ts"),
  );

  assertEquals("trayIconDestination" in plan, false);
  assertStringIncludes(traySource, 'trayCreate("")');
  for (
    const obsolete of [
      "openfx-tray-template",
      "inspectPngTransparency",
      "createTrayTemplatePng",
      "verifyTrayTemplatePng",
    ]
  ) {
    assertEquals(buildSource.includes(obsolete), false);
    assertEquals(smokeSource.includes(obsolete), false);
  }
  await assertRejects(
    () =>
      Deno.stat(
        join(REPOSITORY_ROOT, "entry/desktop/assets/openfx-tray-template.svg"),
      ),
    Deno.errors.NotFound,
  );
  await assertRejects(
    () =>
      Deno.stat(
        join(REPOSITORY_ROOT, "entry/desktop/assets/openfx-tray-template.png"),
      ),
    Deno.errors.NotFound,
  );
});
```

- [ ] **Step 4: Run the focused tests and observe RED**

Run:

```bash
deno test --allow-read --allow-write --allow-net --allow-run=deno \
  entry/desktop/tests/desktop-contract.test.ts \
  entry/desktop/tests/macos-app-bundle.test.ts
```

Expected: FAIL because production still contains `trayCreate(TRAY_ICON_PATH)`, the
builder/smoke still references `openfx-tray-template`, and both image assets still
exist. A permissions, import, or unrelated test error is not the intended RED and must
be fixed before proceeding.

- [ ] **Step 5: Preserve RED evidence without committing a broken `main`**

Record the focused-test failure in the execution notes, then verify that only the two
test files are changed:

```bash
git status --short
git diff --check
```

Expected: only the intended test files are modified. Do not commit the deliberately
failing state; the tests and implementation will land together after GREEN.

---

### Task 2: Restore the native dot and remove the tray-image pipeline

**Files:**

- Modify: `entry/desktop/src/ui/tray.ts`
- Modify: `entry/desktop/tools/build-macos-app.ts`
- Modify: `entry/desktop/tools/desktop-app-smoke.ts`
- Delete: `entry/desktop/tools/png-transparency.ts`
- Delete: `entry/desktop/assets/openfx-tray-template.svg`
- Delete: `entry/desktop/assets/openfx-tray-template.png`

- [ ] **Step 1: Restore the exact Perry tray call**

In `entry/desktop/src/ui/tray.ts`, delete `TRAY_ICON_PATH` and create the tray with the
literal empty path:

```ts
export const createNodeTray = (actions: NodeTrayActions): Widget => {
  const tray = trayCreate("");
  traySetTooltip(tray, "OpenFX Node");
```

Do not change the tooltip, menu construction, selectors, callbacks, or returned widget.

- [ ] **Step 2: Remove image state and conversion from the macOS builder**

In `entry/desktop/tools/build-macos-app.ts`:

- Remove the `inspectPngTransparency` import.
- Remove `trayIconDestination`, `trayIconSource`, and `trayIconVectorSource` from
  `MacAppPlan` and `createMacAppPlan`.
- Remove `stagedTrayIcon`, `createTrayTemplatePng(...)`, and
  `verifyTrayTemplatePng(...)` from `buildMacApp`.
- Remove both tray-asset checks from `validateInputs`.
- Delete the now-unused `createTrayTemplatePng` and `verifyTrayTemplatePng` functions.

The resource portion of `MacAppPlan` must end at the ordinary application icon:

```ts
export interface MacAppPlan {
  appBundle: string;
  contentsDirectory: string;
  executable: string;
  entryPoint: string;
  iconDestination: string;
  iconSource: string;
  infoPlist: string;
  perryExecutable: string;
  perryLibDirectory: string;
  resourcesDirectory: string;
}
```

The build sequence must compile the executable and then proceed directly to the
application icon and plist:

```ts
await compilePerry(plan, stagedExecutable);
await Deno.chmod(stagedExecutable, 0o755);
await createIcns(plan.iconSource, stagedIcon);
await Deno.writeTextFile(stagedInfoPlist, createInfoPlist());
```

- [ ] **Step 3: Remove tray-image validation from the packaged-app smoke**

In `entry/desktop/tools/desktop-app-smoke.ts`:

- Remove the `inspectPngTransparency` import.
- Remove `TRAY_ICON`.
- Remove `assertNonEmptyFile(TRAY_ICON)` and `assertTransparentTrayIcon()` from startup
  validation.
- Delete the `assertTransparentTrayIcon` function.
- Preserve `APP_ICON`, `assertNonEmptyFile(APP_ICON)`, bundle architecture, deployment
  target, plist, signature, health, screenshot, identity, cleanup, and memory checks
  unchanged.

- [ ] **Step 4: Delete the orphaned files**

Delete exactly:

```text
entry/desktop/assets/openfx-tray-template.svg
entry/desktop/assets/openfx-tray-template.png
entry/desktop/tools/png-transparency.ts
```

Do not delete `entry/web/public/openfx-icon-512.png` or any Finlyzer asset.

- [ ] **Step 5: Prove there are no live tray-image references**

Run:

```bash
rg -n "TRAY_ICON_PATH|trayIcon|openfx-tray-template|png-transparency|assertTransparentTrayIcon" \
  entry/desktop \
  --glob '!tests/desktop-contract.test.ts' \
  --glob '!tests/macos-app-bundle.test.ts'
```

Expected: no matches. The test files may contain obsolete strings only as negative
assertions.

- [ ] **Step 6: Run focused tests and observe GREEN**

Run:

```bash
deno test --allow-read --allow-write --allow-net --allow-run=deno \
  entry/desktop/tests/desktop-contract.test.ts \
  entry/desktop/tests/macos-app-bundle.test.ts
```

Expected: both files PASS, including the absent-asset checks and literal
`trayCreate("")` contract.

- [ ] **Step 7: Format and commit the implementation**

Run:

```bash
deno fmt entry/desktop/src/ui/tray.ts \
  entry/desktop/tools/build-macos-app.ts \
  entry/desktop/tools/desktop-app-smoke.ts \
  entry/desktop/tests/desktop-contract.test.ts \
  entry/desktop/tests/macos-app-bundle.test.ts
git diff --check
git add entry/desktop/src/ui/tray.ts \
  entry/desktop/tools/build-macos-app.ts \
  entry/desktop/tools/desktop-app-smoke.ts \
  entry/desktop/tests/desktop-contract.test.ts \
  entry/desktop/tests/macos-app-bundle.test.ts \
  entry/desktop/tools/png-transparency.ts \
  entry/desktop/assets/openfx-tray-template.svg \
  entry/desktop/assets/openfx-tray-template.png
git commit -m "fix(desktop): restore native tray dot"
```

Expected: the commit records the now-passing contracts, source change, and all
tray-image deletions in one green functional commit.

---

### Task 3: Update current product and build documentation

**Files:**

- Modify: `entry/desktop/README.md`
- Modify: `docs/openfx-console-architecture.md`

- [ ] **Step 1: Rewrite the current desktop runtime explanation**

In `entry/desktop/README.md`, replace the image-resolution explanation with:

```md
窗口隐藏只取消 Canvas frame callback，不停止节点。空 Tray 图标路径由 Perry 直接
映射为原生实心圆点 `●`，不解析应用包资源。
```

In the macOS build list, replace the FX-image generation bullet with:

```md
- 保留 Perry 原生空路径 Tray 契约，由 macOS 状态栏显示实心圆点 `●`，应用包不携带 Tray
  图片资产；
```

Keep the `OpenFXNode.icns` application-icon bullet intact.

- [ ] **Step 2: Update the architecture's tray wording**

In `docs/openfx-console-architecture.md`, change “FX Tray” to “原生 `●` Tray” in the
Perry node boundary. Do not rewrite historical plans under `docs/superpowers/plans/`.

- [ ] **Step 3: Verify current documentation no longer presents the removed asset as
      current behavior**

Run:

```bash
rg -n "FX Tray|openfx-tray-template|Tray 模板图标|相对图标" \
  entry/desktop/README.md docs/openfx-console-architecture.md
```

Expected: no matches. A match in the historical 2026-07-19 plan is allowed and must
remain untouched.

- [ ] **Step 4: Format and commit the docs**

Run:

```bash
deno fmt entry/desktop/README.md docs/openfx-console-architecture.md
git diff --check
git add entry/desktop/README.md docs/openfx-console-architecture.md
git commit -m "docs(desktop): document native tray dot"
```

---

### Task 4: Run repository and Perry verification

**Files:**

- Verify only; no expected source changes.

- [ ] **Step 1: Run the desktop-specific check**

Run:

```bash
deno task --config entry/desktop/deno.json check
```

Expected: format, lint, and every desktop test PASS.

- [ ] **Step 2: Run the full repository check**

Run:

```bash
deno task check
```

Expected: repository format, lint, Deno-only guard, shared/web/domain tests, and desktop
tests all PASS.

- [ ] **Step 3: Run Perry's deep dependency check with the pinned runtime**

Run:

```bash
PERRY_LIB_DIR=/tmp/perry-openfx-clean.Nupvg9/Perry/target/openfx-v0.5.1220/release \
  /tmp/perry-openfx-clean.Nupvg9/Perry/target/openfx-v0.5.1220/release/perry \
  check entry/desktop/src/main.ts --deep-deps
```

Expected: PASS with no unresolved Perry UI or system bindings.

- [ ] **Step 4: Inspect the complete change and commit topology**

Run:

```bash
git diff --check
git status --short --branch
git log --oneline -5
```

Expected: clean `main`; the design, plan, green implementation, and documentation
commits are visible. Do not squash unless the user requests it.

---

### Task 5: Build, replace, and visually verify the running application

**Files:**

- Replace generated bundle: `dist/OpenFX Node.app`
- Preserve temporary rollback bundle outside the generated app path until acceptance.

- [ ] **Step 1: Verify the current bundle and create a recoverable rollback copy**

Run these commands in one persistent zsh session so the task-specific variables remain
available:

```bash
openfx_repo=/Users/siaovon/Documents/OpenFX
openfx_bundle="$openfx_repo/dist/OpenFX Node.app"
openfx_executable="$openfx_bundle/Contents/MacOS/OpenFX Node"
openfx_runtime=/tmp/perry-openfx-clean.Nupvg9/Perry/target/openfx-v0.5.1220/release
openfx_rollback_dir=$(/usr/bin/mktemp -d /tmp/openfx-node-rollback.XXXXXX)

/usr/bin/test -x "$openfx_executable"
/usr/bin/ditto "$openfx_bundle" "$openfx_rollback_dir/OpenFX Node.app"
/usr/bin/codesign --verify --deep --strict "$openfx_rollback_dir/OpenFX Node.app"
/bin/echo "rollback=$openfx_rollback_dir"
```

Expected: the rollback bundle is copied and signature verification succeeds. Record the
printed directory in the final handoff; do not delete it before visual acceptance.

- [ ] **Step 2: Build the main-branch candidate while the old mapped process is still
      available**

In the same shell:

```bash
cd "$openfx_repo"
PERRY_LIB_DIR="$openfx_runtime" deno task desktop:app
/usr/bin/codesign --verify --deep --strict "$openfx_bundle"
/usr/bin/file "$openfx_executable"
/usr/bin/plutil -lint "$openfx_bundle/Contents/Info.plist"
/usr/bin/test ! -e \
  "$openfx_bundle/Contents/Resources/openfx-tray-template.png"
```

Expected: build reports `ready`, signature/plist checks pass, the executable is arm64
Mach-O, and no tray PNG is packaged.

- [ ] **Step 3: Gracefully stop only the verified old daily instance**

First ask the registered application to quit:

```bash
/usr/bin/osascript -e 'tell application id "com.openfx.node" to quit'
```

Wait up to five seconds, then inspect exact-path processes and the listener:

```bash
for openfx_wait in 1 2 3 4 5; do
  /usr/bin/pgrep -f "^$openfx_executable" >/dev/null || break
  /bin/sleep 1
done
/usr/bin/pgrep -alf "^$openfx_executable" || true
/usr/sbin/lsof -nP -iTCP:24531 -sTCP:LISTEN || true
```

If an exact-path process remains, verify each command before sending `TERM`:

```bash
while IFS= read -r openfx_pid; do
  [[ -n "$openfx_pid" ]] || continue
  openfx_command=$(/bin/ps -p "$openfx_pid" -o command=)
  if [[ "$openfx_command" != "$openfx_executable"* ]]; then
    /bin/echo "refusing unverified pid=$openfx_pid command=$openfx_command" >&2
    exit 1
  fi
  /bin/kill -TERM "$openfx_pid"
done < <(/usr/bin/pgrep -f "^$openfx_executable" || true)

for openfx_wait in 1 2 3 4 5; do
  /usr/bin/pgrep -f "^$openfx_executable" >/dev/null || break
  /bin/sleep 1
done
! /usr/bin/pgrep -f "^$openfx_executable"
! /usr/sbin/lsof -nP -iTCP:24531 -sTCP:LISTEN
```

Expected: no matching process and no listener. Never kill a name-only or unverified
process. Do not run the app smoke while another process owns port `24531`.

- [ ] **Step 4: Run the packaged-app smoke against the candidate**

Run:

```bash
PERRY_LIB_DIR="$openfx_runtime" deno task desktop:app-smoke
```

Expected: PASS for bundle identity, signature, UI-only Perry link gate, verified
candidate PID, health payload, screenshot, and clean exit. This smoke deliberately no
longer looks for a tray image.

If this step fails, do not launch the candidate as the daily instance. Restore the saved
bundle with the exact-path, recoverable sequence below, then report the failure
evidence:

```bash
/bin/mv "$openfx_bundle" "$openfx_rollback_dir/OpenFX Node.failed.app"
/usr/bin/ditto "$openfx_rollback_dir/OpenFX Node.app" "$openfx_bundle"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$openfx_bundle"
/usr/bin/open -n "$openfx_bundle"
exit 1
```

- [ ] **Step 5: Register and launch exactly one new daily instance**

Run:

```bash
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$openfx_bundle"
/usr/bin/open -n "$openfx_bundle"
```

Wait for startup, then verify process identity, exclusivity, listener, and health:

```bash
for openfx_wait in 1 2 3 4 5 6 7 8 9 10; do
/usr/bin/curl --fail --silent --show-error \
    http://\[::1\]:24531/v1/health && break
  /bin/sleep 1
done
/usr/bin/pgrep -alf "^$openfx_executable"
openfx_pids=("${(@f)$(/usr/bin/pgrep -f "^$openfx_executable")}")
(( ${#openfx_pids[@]} == 1 ))
openfx_pid=${openfx_pids[1]}
/usr/sbin/lsof -nP -a -p "$openfx_pid" -iTCP:24531 -sTCP:LISTEN
/usr/bin/curl --fail --silent --show-error http://\[::1\]:24531/v1/health
```

Expected: exactly one exact-path OpenFX Node PID, that PID owns TCP `24531`, and health
is `{"ok":true,"protocolVersion":1}`.

- [ ] **Step 6: Perform the required visual menu-bar acceptance**

Capture the live menu bar after the new process is running:

```bash
/usr/sbin/screencapture -x "$openfx_rollback_dir/openfx-node-menubar.png"
```

Inspect the screenshot at the recorded absolute path. Then use macOS computer control to
click the visible solid `●` and verify that its menu contains at least
`显示 OpenFX Node`, `节点状态`, `立即采样`, `打开 OpenFX 控制台`, and `退出`. Capture a
second screenshot with the menu open:

```bash
/usr/sbin/screencapture -x "$openfx_rollback_dir/openfx-node-menu-open.png"
```

Acceptance requires all of the following:

- The status item is the simple native solid circle `●`, not the FX glyph.
- Clicking that circle opens the OpenFX Node menu, proving the inspected item belongs to
  the new app.
- The tray tooltip/menu actions and the app's normal Dock icon remain intact.
- The new exact-path process remains healthy after the visual interaction.

- [ ] **Step 7: Final evidence and rollback disposition**

Run:

```bash
git status --short --branch
git branch --format='%(refname:short)'
/usr/bin/pgrep -alf "^$openfx_executable"
/usr/bin/curl --fail --silent --show-error http://\[::1\]:24531/v1/health
/bin/echo "rollback=$openfx_rollback_dir"
/bin/echo "visual=$openfx_rollback_dir/openfx-node-menu-open.png"
```

Expected: clean `main`, `main` is the only local branch, exactly one healthy daily
instance exists, and a visual artifact is recorded. Keep the rollback directory and
report its path; remove or move it to Trash only after the user confirms no rollback is
needed.

---

## Completion Criteria

- `entry/desktop/src/ui/tray.ts` contains the literal `trayCreate("")` and no
  `TRAY_ICON_PATH`.
- No live desktop code, builder, or smoke path references the deleted tray PNG/SVG or
  PNG-transparency helper.
- The application icon pipeline remains unchanged.
- Focused tests, desktop check, full repository check, Perry deep check, app build, and
  packaged-app smoke all pass.
- The old daily process is gone; exactly one new process from
  `/Users/siaovon/Documents/OpenFX/dist/OpenFX Node.app/Contents/MacOS/OpenFX Node` owns
  port `24531` and returns the expected health payload.
- A live visual inspection confirms the exact native `●` and its OpenFX Node menu.
- `main` is clean and remains the only local branch.
