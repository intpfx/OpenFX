import { assert, assertEquals } from "@std/assert";

const MAIN_URL = new URL("../src/main.ts", import.meta.url);
const SRC_URL = new URL("../src/", import.meta.url);
const BUILD_RUNTIME_URL = new URL("../tools/build-perry-runtime.ts", import.meta.url);
const APP_SMOKE_URL = new URL("../tools/desktop-app-smoke.ts", import.meta.url);
const PERRY_PATCH_URL = new URL(
  "../perry/perry-v0.5.1220-openfx.patch",
  import.meta.url,
);

Deno.test("desktop entry is an accessory tray app with the required native boundaries", async () => {
  const source = await readTypeScriptTree(SRC_URL);
  const main = await Deno.readTextFile(MAIN_URL);

  assert(main.includes('appSetActivationPolicy("accessory")'));
  assert(main.includes("trayCreate("));
  assert(main.includes('"perryShowMainWindow:"'));
  assertEquals(main.includes("Window("), false);
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
    patch.includes("js_stdlib_ensure_pump_registered") &&
      patch.includes("js_stdlib_ensure_pump_registered();") &&
      patch.includes("ensure_pump_only_registered") &&
      patch.includes(
        "crate::common::async_bridge::ensure_pump_only_registered();",
      ),
    "stdlib dispatch initialization must idempotently register its UI pump",
  );
  assert(
    patch.includes("perry_ffi_run_pending(0);") &&
      patch.indexOf("perry_ffi_run_pending(0);") <
        patch.indexOf("js_run_stdlib_pump();"),
    "the native UI timer must drive Perry's current-thread async reactor before draining HTTP",
  );
  assert(
    patch.includes("capture_main_view_png") &&
      patch.includes("bitmapImageRepForCachingDisplayInRect"),
    "test-mode screenshots must fall back to app-owned view rendering without Screen Recording permission",
  );
  assert(patch.includes('join("Resources")'));
  assert(patch.includes("std::env::current_exe()"));
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
  assert(smoke.includes("assertPng"));
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
