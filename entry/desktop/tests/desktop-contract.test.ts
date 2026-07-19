import { assert, assertEquals } from "@std/assert";

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
  assert(source.includes("trayCreate(TRAY_ICON_PATH)"));
  assert(
    source.includes(
      'TRAY_ICON_PATH = "entry/web/public/favicon-32x32.png"',
    ),
  );
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
    main.includes("appSetTimer(1, () => {") &&
      main.includes("void lifecycle.start();"),
    "service startup must be scheduled onto the native App timer pump",
  );
  assert(
    main.includes("if (servicesStarted) return;") &&
      main.includes("servicesStarted = true;"),
    "the recurring native timer must start services only once",
  );
  assertEquals(
    main.slice(appIndex).includes("lifecycle.mainWindowShown()"),
    false,
    "App() blocks, so lifecycle updates after it are unreachable",
  );
});

Deno.test("pinned Perry runtime build includes the patched macOS UI archive", async () => {
  const build = await Deno.readTextFile(BUILD_RUNTIME_URL);
  const patch = await Deno.readTextFile(PERRY_PATCH_URL);
  const macosAppPatch = patch.split(
    "diff --git a/crates/perry-ui-macos/src/app.rs",
  )[1]?.split("diff --git", 1)[0] ?? "";

  assert(build.includes('"perry-ui-macos"'));
  assert(build.includes('"libperry_ui_macos.a"'));
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
    patch.match(/invoke_activate_callback\(\);/g)?.length === 2,
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
    main.includes('startupPreferences.launchMode === "menuBarOnly"') &&
      main.includes('? "accessory"') && main.includes(': "regular"'),
    "activation policy must be selected synchronously from persisted startup preferences",
  );
  assertEquals(main.includes('appSetActivationPolicy("accessory")'), false);
  assert(main.includes("createCoreCanvasRenderer("));
  assert(main.includes("createControlPanel("));
  assert(main.includes("createNodeTray("));
  assert(main.includes("width: 960"));
  assert(main.includes("height: 640"));
  assert(main.includes("minWidth: 880"));
  assert(main.includes("minHeight: 580"));
  assert(main.includes('vibrancy: "underWindowBackground"'));
  assert(
    main.includes(
      "onActivate(() => {\n  lifecycle.mainWindowShown();\n  coreRenderer?.stop();\n  coreRenderer?.setWindowVisible(true);\n  coreRenderer?.start();",
    ),
    "native reopen must reset the stale frame token before scheduling a fresh frame",
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
  assertEquals(source.includes('trayCreate("")'), false);
  assert(
    source.includes(
      'menuAddStandardAction(\n    menu,\n    "节点状态",\n    "perryShowMainWindow:",',
    ),
    "node status must use the native show-window selector",
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

Deno.test("real desktop app smoke compiles main, checks IPv6 health, and captures UI", async () => {
  const smoke = await Deno.readTextFile(APP_SMOKE_URL);

  assert(smoke.includes("entry/desktop/src/main.ts"));
  assert(smoke.includes("--no-auto-optimize"));
  assert(smoke.includes("libperry_ui_macos.a"));
  assert(smoke.includes("http://[::1]:24531/v1/health"));
  assert(smoke.includes("PERRY_UI_TEST_MODE"));
  assert(smoke.includes("PERRY_UI_SCREENSHOT_PATH"));
  assert(smoke.includes('PERRY_UI_TEST_EXIT_AFTER_MS: "12000"'));
  assert(smoke.includes("APP_EXIT_DEADLINE_MS = 13_000"));
  assert(smoke.includes("collectBoundedChild"));
  assert(smoke.includes("Perry UI app clean-exit timed out"));
  assert(smoke.includes("openfx-ui-only-link"));
  assert(smoke.includes("OpenFX UI-only link gate"));
  assert(smoke.includes("assertPng"));
  assert(smoke.includes("entry/web/public/favicon-32x32.png"));
  assert(smoke.includes("assertNonEmptyFile(TRAY_ICON_SOURCE)"));
  assertEquals(smoke.includes("TRAY_ICON_NAME"), false);
  assertEquals(
    smoke.includes("Deno.copyFile(\n    TRAY_ICON_SOURCE"),
    false,
  );
  assert(smoke.includes("PERRY_UI_SCREENSHOT_ARTIFACT"));
  assert(smoke.includes("screenshotArtifact"));
});

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
