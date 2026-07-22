import { assert, assertEquals } from "@std/assert";

import {
  type CoreCanvasMetrics,
  type CoreCanvasRenderer,
  createCoreCanvasRenderer,
} from "../src/ui/core-canvas.ts";

const MAIN_URL = new URL("../src/main.ts", import.meta.url);
const SRC_URL = new URL("../src/", import.meta.url);
const BUILD_RUNTIME_URL = new URL("../tools/build-perry-runtime.ts", import.meta.url);
const APP_SMOKE_URL = new URL("../tools/desktop-app-smoke.ts", import.meta.url);
const INTEGRATION_SMOKE_URL = new URL(
  "../tools/console-integration-smoke.ts",
  import.meta.url,
);
const PERRY_PATCH_URL = new URL(
  "../perry/perry-v0.5.1220-openfx.patch",
  import.meta.url,
);

Deno.test("desktop entry keeps native tray and runtime boundaries in both launch modes", async () => {
  const source = await readTypeScriptTree(SRC_URL);
  const main = await Deno.readTextFile(MAIN_URL);

  assert(main.includes("appSetActivationPolicy("));
  assert(main.includes("createNodeTray("));
  assert(source.includes('trayCreate("")'));
  assertEquals(source.includes("TRAY_ICON_PATH"), false);
  assert(source.includes('"perryShowMainWindow:"'));
  assertEquals(/\bWindow\(/.test(main), false);
  assert(source.includes('from "node:http"'));
  assert(source.includes('from "node:https"'));
  assert(source.includes('from "node:crypto"'));
  assert(source.includes('from "node:child_process"'));
  assert(!source.includes("fetch("));
  assert(source.includes('hostname: "127.0.0.1"'));
  assert(source.includes('KEYCHAIN_SERVICE = "OpenFX Node"'));
});

Deno.test("desktop entry exposes the exact closed v1 Agent tool set", async () => {
  const source = await readTypeScriptTree(SRC_URL);
  const expected = [
    "system.getOverview",
    "process.list",
    "network.getStatus",
    "relay.getStatus",
    "audit.list",
    "process.kill",
    "app.open",
    "relay.update",
  ];

  for (const id of expected) assert(source.includes(`\"${id}\"`));
  assertEquals(source.includes("shell.exec"), false);
  assertEquals(source.includes("file.read"), false);
  assertEquals(source.includes("url.open"), false);
});

Deno.test("desktop entry schedules services from the native App event loop", async () => {
  const main = await Deno.readTextFile(MAIN_URL);
  const appIndex = main.indexOf("App({");

  assert(appIndex > 0, "desktop entry must start the native App event loop");
  assert(
    main.includes("setTimeout(() => {") &&
      main.includes("void lifecycle.start();"),
    "service startup must be scheduled once onto the native event loop",
  );
  assertEquals(main.includes("appSetTimer"), false);
  assertEquals(main.includes("let servicesStarted"), false);
  assertEquals(
    main.slice(appIndex).includes("lifecycle.mainWindowShown()"),
    false,
    "App() blocks, so lifecycle updates after it are unreachable",
  );
});

Deno.test("system telemetry is startup and user-event driven", async () => {
  const main = await Deno.readTextFile(MAIN_URL);
  const monitor = await Deno.readTextFile(
    new URL("../src/native/system-monitor.ts", import.meta.url),
  );
  const sampleHook = main.slice(
    main.indexOf("onSample(state) {"),
    main.indexOf("async onError(error) {"),
  );
  const errorHook = main.slice(
    main.indexOf("async onError(error) {"),
    main.indexOf("const gate = new SafetyActionGate"),
  );

  assertEquals(main.includes("automaticTelemetryPresentationComplete"), false);
  assertEquals(sampleHook.includes("refresh"), false);
  assertEquals(errorHook.includes("refresh"), false);
  assert(
    sampleHook.includes("return reporter.report(state);"),
    "unpaired samples must finish synchronously without a Promise",
  );
  assertEquals(sampleHook.includes("async onSample"), false);
  assertEquals(monitor.includes("setInterval("), false);
  assert(monitor.includes("let started = false;"));
  assert(monitor.includes("if (started) return;") && monitor.includes("sample();"));
  assert(
    main.includes("async function sampleAndRefreshPresentation()") &&
      main.match(/void sampleAndRefreshPresentation\(\);/g)?.length === 3,
    "activation, control-panel, and tray samples must refresh the presentation",
  );
});

Deno.test("pinned Perry Set hashing rejects the complete native handle band", async () => {
  const patch = await Deno.readTextFile(PERRY_PATCH_URL);

  assert(
    patch.includes("diff --git a/crates/perry-runtime/src/set.rs") &&
      patch.includes("addr_class::is_handle_band") &&
      patch.includes("try_read_gc_header"),
    "Set string detection must classify handles before reading a GC header",
  );
  for (const boundary of ["0x0fff", "0x1000", "0x1001", "0x3ffff", "0xfffff"]) {
    assert(
      patch.includes(boundary),
      `missing Perry handle regression boundary ${boundary}`,
    );
  }
});

Deno.test("pinned Perry HTTP pump reaps parked requests without full handle churn", async () => {
  const patch = await Deno.readTextFile(PERRY_PATCH_URL);
  const pumpStart = patch.indexOf(
    'pub extern "C" fn js_node_http_server_process_pending() -> i32',
  );
  const gateStart = patch.indexOf(
    "fn http_server_pump_has_pending_work() -> bool",
  );
  const gateEnd = patch.indexOf("pub(crate) fn server_is_active", gateStart);
  assert(pumpStart >= 0 && gateStart > pumpStart && gateEnd > gateStart);

  const pump = patch.slice(pumpStart, gateStart);
  assert(
    pump.includes("parked async responses need a cheap readiness check every tick") &&
      pump.includes("Reap first, then let only actual queue/listen/h2"),
    "the pinned patch must keep the reaper before the full-pump work gate",
  );
  assert(patch.includes("HTTP_PUMP_HANDLE_SCRATCH"));
  assert(pump.includes("snapshot_http_pump_handles::<HttpServer>()"));
  assert(pump.includes("recycle_http_pump_handles(http_handles)"));
  assertEquals(
    patch.slice(gateStart, gateEnd).includes("has_in_flight_requests()"),
    false,
    "parked response liveness must not open the full handle-snapshot pump",
  );
});

Deno.test("native main-window visibility owns renderer lifecycle", async () => {
  const main = await Deno.readTextFile(MAIN_URL);
  const stub = await Deno.readTextFile(
    new URL("../src/perry-ui-stub.ts", import.meta.url),
  );
  const patch = await Deno.readTextFile(PERRY_PATCH_URL);
  const visibilityHook = main.slice(
    main.indexOf("onMainWindowVisibilityChanged((visible) => {"),
    main.indexOf("onTerminate(() => {"),
  );
  const activateHook = main.slice(
    main.indexOf("onActivate(() => {"),
    main.indexOf("onMainWindowVisibilityChanged((visible) => {"),
  );

  assert(
    main.indexOf("onMainWindowVisibilityChanged((visible) => {") <
      main.indexOf("App({"),
    "visibility callback must be registered before the blocking App call",
  );
  assert(
    visibilityHook.includes("lifecycle.mainWindowShown();") &&
      visibilityHook.includes("lifecycle.mainWindowClosed();") &&
      visibilityHook.includes("coreRenderer?.setWindowVisible(visible);"),
    "native visibility must update both service-preserving lifecycle state and rendering",
  );
  assertEquals(visibilityHook.includes("lifecycle.terminate()"), false);
  assertEquals(activateHook.includes("coreRenderer?.stop()"), false);
  assertEquals(activateHook.includes("coreRenderer?.start()"), false);
  assertEquals(activateHook.includes("setWindowVisible"), false);
  assert(stub.includes("onMainWindowVisibilityChanged"));

  for (
    const apiSurface of [
      'method("perry/ui", "onMainWindowVisibilityChanged"',
      'method: "onMainWindowVisibilityChanged"',
      "perry_ui_app_on_main_window_visibility_changed",
      "register_on_main_window_visibility_changed",
      "export function onMainWindowVisibilityChanged",
    ]
  ) {
    assert(patch.includes(apiSurface), `missing Perry visibility API: ${apiSurface}`);
  }
  assertEquals(
    patch.match(/invoke_main_window_visibility_changed_callback\(true\);/g)?.length,
    3,
    "initial show, Dock reopen, and the show-window selector must emit visible",
  );
  assert(
    patch.includes("invoke_main_window_visibility_changed_callback(false);") &&
      patch.includes("js_cancel_all_frames();"),
    "native close must propagate hidden state and cancel only frame callbacks",
  );
  assert(
    patch.includes("TAG_TRUE") && patch.includes("TAG_FALSE"),
    "native visibility callback must pass a real Perry boolean",
  );
});

Deno.test("native reopening reuses the lifetime static frame", async () => {
  const main = await Deno.readTextFile(MAIN_URL);
  const activateHook = main.slice(
    main.indexOf("onActivate(() => {"),
    main.indexOf("onMainWindowVisibilityChanged((visible) => {"),
  );
  const activationRefreshesRenderer = activateHook.includes(
    "sampleAndRefreshPresentation();",
  );
  const replayActivation = (
    renderer: CoreCanvasRenderer,
    metrics: CoreCanvasMetrics,
  ): void => {
    if (activationRefreshesRenderer) renderer.update(metrics);
  };

  const reopened = createReducedMotionPaintHarness();
  reopened.renderer.start();
  reopened.renderer.setWindowVisible(false);
  const hiddenMetrics = {
    state: "degraded" as const,
    cpuUsagePercent: 70,
    memoryUsagePercent: 80,
    reduceMotion: true,
  };
  reopened.renderer.update(hiddenMetrics);
  const hiddenPaints = reopened.paintCount();
  reopened.renderer.setWindowVisible(true);
  replayActivation(reopened.renderer, hiddenMetrics);
  assertEquals(
    reopened.paintCount() - hiddenPaints,
    0,
    "hidden metrics -> visible -> activation must reuse the static frame",
  );

  const startup = createReducedMotionPaintHarness();
  const startupMetrics = {
    state: "online" as const,
    cpuUsagePercent: 25,
    memoryUsagePercent: 35,
    reduceMotion: true,
  };
  startup.renderer.start();
  startup.renderer.setWindowVisible(true);
  replayActivation(startup.renderer, startupMetrics);
  assertEquals(
    startup.paintCount(),
    1,
    "initial static start -> visible -> activation must not double-paint",
  );

  assert(
    activateHook.includes("void sampleAndRefreshPresentation();") &&
      !activateHook.includes("refreshPresentation();") &&
      !activateHook.includes("coreRenderer"),
    "activation must request one event-driven sample without direct renderer mutation",
  );
});

Deno.test("pinned Perry runtime build includes the patched macOS UI archive", async () => {
  const build = await Deno.readTextFile(BUILD_RUNTIME_URL);
  const provenance = await Deno.readTextFile(
    new URL("../tools/perry-runtime-provenance.ts", import.meta.url),
  );
  const buildContract = `${build}\n${provenance}`;
  const patch = await Deno.readTextFile(PERRY_PATCH_URL);
  const macosAppPatch = patch.split(
    "diff --git a/crates/perry-ui-macos/src/app.rs",
  )[1]?.split("diff --git", 1)[0] ?? "";

  assert(buildContract.includes('"perry-ui-macos"'));
  assert(buildContract.includes('"libperry_ui_macos.a"'));
  assert(
    patch.includes("fn main_window_is_visible() -> bool") &&
      patch.includes("if main_window_is_visible()") &&
      patch.includes("js_frame_pump_default();"),
    "hidden windows may pause only frame callbacks",
  );
  assert(
    patch.includes("js_run_stdlib_pump();") &&
      patch.includes("js_promise_run_microtasks();"),
    "the stdlib pump must continue while the UI event loop is alive",
  );
  assert(
    patch.includes("js_drive_registered_pending(0);") &&
      patch.indexOf("js_drive_registered_pending(0);") <
        patch.indexOf("js_run_stdlib_pump();"),
    "the native UI timer must drive Perry's current-thread async reactor before draining HTTP",
  );
  assert(
    patch.includes("Some(stdlib_drive_pending),") &&
      patch.includes("WAIT_DRIVER_DRIVE.load(Ordering::Acquire)") &&
      patch.includes("drive_pending(budget_ms);"),
    "the UI runtime hook must use the full pending-work driver, not the notification-sensitive sleep path",
  );
  assertEquals(
    macosAppPatch.includes("perry_ffi_run_pending"),
    false,
    "the macOS UI archive must not hard-link perry-stdlib FFI",
  );
  assertEquals(
    macosAppPatch.includes("js_stdlib_ensure_pump_registered"),
    false,
    "the macOS UI archive must remain linkable without perry-stdlib",
  );
  assert(
    patch.includes("pub(crate) fn ensure_pump_core_registered()") &&
      patch.includes(
        "crate::common::async_bridge::ensure_pump_core_registered();",
      ) &&
      patch.includes("INIT.call_once(|| unsafe { js_stdlib_init_dispatch_inner() });"),
    "the generated needs_stdlib initializer must register the reactor without a UI-to-stdlib link",
  );
  assertEquals(
    patch.includes("perry_ffi::run_pending(0);"),
    false,
    "reactor registration must not depend on a late HTTP-module entry point",
  );
  assert(
    patch.includes("capture_main_view_png") &&
      patch.includes("bitmapImageRepForCachingDisplayInRect"),
    "test-mode screenshots must fall back to app-owned view rendering without Screen Recording permission",
  );
  assert(patch.includes('join("Resources")'));
  assert(patch.includes("std::env::current_exe()"));
});

Deno.test("pinned Perry App config wires vibrancy, minimum size, and close-to-hide", async () => {
  const build = await Deno.readTextFile(BUILD_RUNTIME_URL);
  const smoke = await Deno.readTextFile(APP_SMOKE_URL);
  const patch = await Deno.readTextFile(PERRY_PATCH_URL);

  assert(
    patch.includes('"vibrancy" =>') &&
      patch.includes('"minWidth" =>') &&
      patch.includes('"minHeight" =>'),
    "the fixed Perry lowerer must recognize the native window properties used by OpenFX",
  );
  assert(
    patch.includes('"perry_ui_app_set_vibrancy".to_string()') &&
      patch.includes('"perry_ui_app_set_min_size".to_string()'),
    "the recognized properties must call Perry's existing native AppKit FFI",
  );
  assert(
    patch.includes("setReleasedWhenClosed: false"),
    "closing the main window must only hide it so Dock and tray can reopen it",
  );
  assert(
    patch.includes('pub extern "C" fn js_cancel_all_frames()') &&
      patch.includes("windowWillClose:") &&
      patch.includes("js_cancel_all_frames();"),
    "closing the native main window must clear pending frame callbacks",
  );
  assert(
    patch.match(/^\+\s+invoke_activate_callback\(\);/gm)?.length === 2,
    "Dock reopen and the Show Main Window selector must both resume the existing activation lifecycle",
  );
  assert(
    build.includes('"-p",\n    "perry"') && build.includes('"dev-cli"'),
    "the pinned build must include the compiler whose App lowerer was patched",
  );
  assert(
    smoke.includes('join(perryLibDirectory, "perry")'),
    "the real UI smoke must compile with the matching pinned compiler",
  );
});

Deno.test("desktop entry assembles the immersive regular-or-menu-bar native app", async () => {
  const source = await readTypeScriptTree(SRC_URL);
  const main = await Deno.readTextFile(MAIN_URL);

  assert(main.includes("readDesktopPreferencesSync()"));
  assert(
    main.includes('currentWindowPolicy().mode === "menuBarOnly"') &&
      main.includes('? "accessory"') && main.includes(': "regular"'),
    "activation policy must be selected synchronously from the effective Perry window policy",
  );
  assertEquals(main.includes('appSetActivationPolicy("accessory")'), false);
  assert(main.includes("createCoreCanvasRenderer("));
  assert(
    main.includes(
      'initialWindowVisible: currentWindowPolicy().mode !== "menuBarOnly"',
    ),
    "menu-bar-only cold start must keep Canvas hidden before native visibility",
  );
  assert(main.includes("createControlPanel("));
  assert(main.includes("createNodeTray("));
  assert(main.includes("width: 960"));
  assert(main.includes("height: 640"));
  assert(main.includes("minWidth: 880"));
  assert(main.includes("minHeight: 580"));
  assert(main.includes('vibrancy: "underWindowBackground"'));
  assert(
    main.includes(
      "onActivate(() => {\n  void sampleAndRefreshPresentation();\n});",
    ),
    "activation must refresh the snapshot while native visibility owns renderer restart",
  );
  assert(source.includes("textSetString("));
  assertEquals(source.includes("WebView("), false);
  for (
    const label of [
      "1 · 环境检查",
      "2 · HTTPS 与配对码",
      "3 · 钥匙串确认",
      "CPU",
      "内存",
      "进程",
      "公网 IPv6",
      "Relay",
      "Agent",
      "上次上报",
      "立即采样",
      "重新配对",
      "显示 OpenFX Node",
      "节点状态",
      "打开 OpenFX 控制台",
      "退出",
    ]
  ) assert(source.includes(label), `missing desktop label: ${label}`);
  assert(source.includes('trayCreate("")'));
  assert(
    source.includes(
      'menuAddStandardAction(\n    menu,\n    "节点状态",\n    "perryShowMainWindow:",',
    ),
    "node status must use the native show-window selector",
  );
});

Deno.test("production desktop forces the Perry stable static core while retaining the preference surface", async () => {
  const main = await Deno.readTextFile(MAIN_URL);
  const policy = await Deno.readTextFile(
    new URL("../src/core/core-motion-policy.ts", import.meta.url),
  );
  const controlPanel = await Deno.readTextFile(
    new URL("../src/ui/control-panel.ts", import.meta.url),
  );
  const stableCore = await Deno.readTextFile(
    new URL("../src/ui/stable-core.ts", import.meta.url),
  );

  assert(policy.includes("PERRY_ANIMATED_CORE_AVAILABLE = false"));
  assert(policy.includes("PERRY_VISIBLE_MAIN_WINDOW_AVAILABLE = false"));
  assert(main.includes("reduceMotion: currentMotionPolicy().reduceMotion"));
  assert(main.includes("motionPolicy: currentMotionPolicy()"));
  assert(main.includes("windowPolicy: currentWindowPolicy()"));
  assert(main.includes('currentWindowPolicy().mode === "menuBarOnly"'));
  assert(main.includes('currentMotionPolicy().mode === "animated"'));
  assert(main.includes("coreRenderer?.canvas ?? createStableCorePanel()"));
  assert(stableCore.includes('Text("FX")'));
  assert(stableCore.includes("VStack("));
  assertEquals(stableCore.includes("Canvas("), false);
  assertEquals(stableCore.includes("onFrame("), false);
  assert(controlPanel.includes("motionControlAvailable: boolean"));
  assert(controlPanel.includes("updateMotionControlVisibility("));
  assert(controlPanel.includes("widgetSetHidden(toggle, controlAvailable ? 0 : 1)"));
});

Deno.test("desktop controls clear consumed codes and expose only Chinese operation errors", async () => {
  const main = await Deno.readTextFile(MAIN_URL);
  const controlPanel = await Deno.readTextFile(
    new URL("../src/ui/control-panel.ts", import.meta.url),
  );
  const preferenceSection = main.slice(
    main.indexOf("function persistLaunchMode"),
    main.indexOf("function createId"),
  );
  const pairSection = main.slice(
    main.indexOf("const pairWithControlPlane = async"),
    main.indexOf("const bootstrap = async"),
  );

  assert(controlPanel.includes("clearPairingCode(): void;"));
  assert(controlPanel.includes('textfieldSetString(codeField, "");'));
  assert(pairSection.includes("controlPanel?.clearPairingCode();"));
  assert(
    preferenceSection.includes("): boolean") &&
      preferenceSection.includes("return true;") &&
      preferenceSection.includes("return false;"),
    "preference persistence must report whether the save actually succeeded",
  );
  assert(
    preferenceSection.includes("const saved = persistPreferenceChoice") &&
      preferenceSection.includes("if (!saved) return;"),
    "launch-mode success copy must only appear after a successful save",
  );
  assert(
    preferenceSection.includes("preferenceStore.update(patch);") &&
      preferenceSection.includes("applyAuthoritativePairing(pairing)") &&
      !preferenceSection.includes("await preferenceStore.update"),
    "preference writes must synchronously apply the authoritative persisted snapshot",
  );
  assert(
    pairSection.includes("applyAuthoritativePairing(candidate)") &&
      !pairSection.includes("preferences.set(pairing.preferences)"),
    "pair completion must never apply the async service snapshot directly",
  );
  const bootstrapSection = main.slice(
    main.indexOf("const bootstrap = async"),
    main.indexOf("const lifecycle =", main.indexOf("const bootstrap = async")),
  );
  assert(
    bootstrapSection.includes(
      "applyAuthoritativePairing(restored ?? pairing)",
    ),
    "a stale restore rejection must not clear a newer pairing completed during Keychain I/O",
  );
  assert(
    preferenceSection.includes("describeDesktopError(error)") &&
      !preferenceSection.includes("无法打开控制台：${errorMessage(error)}"),
    "preference and open-console errors must use the Chinese safe mapper",
  );
});

Deno.test("desktop pairing contains sampling and pairing in one user-safe finally boundary", async () => {
  const main = await Deno.readTextFile(MAIN_URL);
  const start = main.indexOf("const pairWithControlPlane = async");
  const end = main.indexOf("const bootstrap = async", start);
  const pairing = main.slice(start, end);
  const tryIndex = pairing.indexOf("try {");
  const sampleIndex = pairing.indexOf("await systemMonitor.sampleNow();");

  assert(start >= 0 && end > start, "pairing entry function must exist");
  assert(
    tryIndex >= 0 && sampleIndex > tryIndex,
    "sampling and readiness must be protected by the same pairing try/finally",
  );
  assertEquals(
    pairing.match(/pairingInProgress = false;/g)?.length,
    1,
    "pairing progress must clear in exactly one finally path",
  );
  assert(
    pairing.includes("finally {\n    pairingInProgress = false;"),
    "every sampling/readiness/pairing exit must clear progress",
  );
  assert(
    pairing.includes("const userMessage = describeDesktopError(error);") &&
      pairing.includes("serviceStatus.set(`配对失败：${userMessage}`)") &&
      pairing.includes("pairingStatus.set(`配对失败：${userMessage}`)"),
    "both pairing labels must use the Task 2 user-safe error mapping",
  );
  assertEquals(
    pairing.includes("errorMessage(error)"),
    false,
    "raw internal pairing errors must never reach native labels",
  );
});

Deno.test("HTTPS integration compiles with the matching pinned Perry CLI", async () => {
  const smoke = await Deno.readTextFile(INTEGRATION_SMOKE_URL);

  assert(smoke.includes('Deno.env.get("PERRY_LIB_DIR")'));
  assert(smoke.includes('join(perryLibDirectory, "perry")'));
  assertEquals(smoke.includes("/opt/homebrew/bin/perry"), false);
});

Deno.test("real desktop app smoke launches the bundle, checks IPv6 health, and captures UI", async () => {
  const smoke = await Deno.readTextFile(APP_SMOKE_URL);

  assert(smoke.includes('APP_BUNDLE_RELATIVE_PATH = "dist/OpenFX Node.app"'));
  assert(smoke.includes('APP_EXECUTABLE_RELATIVE_PATH = "Contents/MacOS/OpenFX Node"'));
  assert(smoke.includes('new Deno.Command("/usr/bin/open"'));
  assert(smoke.includes("--openfx-smoke-token"));
  assert(smoke.includes("OPENFX_APP_SMOKE_TOKEN"));
  assert(smoke.includes("OPENFX_APP_SMOKE_LAUNCH_PATH"));
  assert(smoke.includes("OPENFX_APP_SMOKE_CLEAN_EXIT_PATH"));
  assert(smoke.includes("waitForVerifiedAppInstance"));
  assert(smoke.includes("if (!memoryMode) await showVerifiedAppInstance(instance);"));
  assert(smoke.includes("terminateVerifiedAppInstance"));
  assert(smoke.includes("assertCleanExitMarker"));
  assert(smoke.includes('new Deno.Command("/usr/bin/osascript"'));
  assert(smoke.includes('tell application id "com.openfx.node" to quit'));
  assert(smoke.includes("/usr/sbin/lsof"));
  assert(smoke.includes("Deno.kill(instance.pid"));
  assertEquals(smoke.includes("killall"), false);
  assertEquals(smoke.includes("pkill"), false);
  assertEquals(smoke.includes("runPerryCompile(MAIN_PATH"), false);
  assert(smoke.includes("--no-auto-optimize"));
  assert(smoke.includes("libperry_ui_macos.a"));
  assert(smoke.includes("http://[::1]:24531/v1/health"));
  assert(smoke.includes("PERRY_UI_TEST_MODE"));
  assert(smoke.includes("PERRY_UI_SCREENSHOT_PATH"));
  assert(smoke.includes('"PERRY_UI_TEST_EXIT_AFTER_MS=12000"'));
  assert(smoke.includes("MEMORY_TEST_EXIT_AFTER_MS"));
  assert(smoke.includes("MEMORY_WARMUP_MS +"));
  assert(smoke.includes("MEMORY_SAMPLE_INTERVAL_MS * MEMORY_SAMPLE_COUNT"));
  assert(
    smoke.includes(
      "PERRY_UI_TEST_EXIT_AFTER_MS=${MEMORY_TEST_EXIT_AFTER_MS}",
    ),
  );
  assert(smoke.includes("APP_EXIT_DEADLINE_MS = 13_000"));
  assert(smoke.includes("collectBoundedChild"));
  assert(smoke.includes("Perry UI app clean-exit timed out"));
  assert(smoke.includes("openfx-ui-only-link"));
  assert(smoke.includes("OpenFX UI-only link gate"));
  assert(smoke.includes("assertPng"));
  assert(smoke.includes("if (!memoryMode) {\n    await assertPng(screenshot);"));
  assertEquals(
    smoke.includes("Contents/Resources/openfx-tray-template.png"),
    false,
  );
  assertEquals(smoke.includes("assertTransparentTrayIcon"), false);
  assertEquals(smoke.includes("assertNonEmptyFile(TRAY_ICON)"), false);
  assertEquals(smoke.includes("inspectPngTransparency"), false);
  assert(smoke.includes("PERRY_UI_SCREENSHOT_ARTIFACT"));
  assert(smoke.includes("screenshotArtifact"));
  assert(smoke.includes('"CFBundleIdentifier", "com.openfx.node"'));
  assert(smoke.includes('"CFBundleExecutable", "OpenFX Node"'));
  assert(smoke.includes('"LSMinimumSystemVersion", "13.0"'));
  assert(smoke.includes('"CFBundleIconFile", "OpenFXNode"'));
});

Deno.test("desktop main writes token-bound launch and clean-exit markers in test mode", async () => {
  const main = await Deno.readTextFile(MAIN_URL);

  assert(main.includes('from "node:fs"'));
  assert(main.includes("deriveDesktopAppSmokeRun("));
  assert(main.includes('writeDesktopAppSmokeMarker("launched")'));
  assert(main.includes('writeDesktopAppSmokeMarker("clean-exit")'));
  assert(main.includes("serializeDesktopAppSmokeMarker("));
});

function createReducedMotionPaintHarness(): {
  renderer: CoreCanvasRenderer;
  paintCount: () => number;
} {
  let paints = 0;
  const canvas = {
    setFillColor() {},
    setStrokeColor() {},
    setLineWidth() {},
    fillRect() {},
    clearRect() {
      paints += 1;
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
  } as unknown as import("perry/ui").Canvas;

  return {
    renderer: createCoreCanvasRenderer({
      width: 560,
      height: 576,
      initialMetrics: {
        state: "online",
        cpuUsagePercent: 25,
        memoryUsagePercent: 35,
        reduceMotion: true,
      },
      now: () => 1_000,
      canvas,
    }),
    paintCount: () => paints,
  };
}

async function readTypeScriptTree(directory: URL): Promise<string> {
  const sources: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), directory);
    if (entry.isDirectory) {
      sources.push(await readTypeScriptTree(url));
    } else if (entry.isFile && entry.name.endsWith(".ts")) {
      sources.push(await Deno.readTextFile(url));
    }
  }
  return sources.join("\n");
}
