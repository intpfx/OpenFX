import { assert, assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { fromFileUrl, join } from "jsr:@std/path@^1.1.4";

const REPOSITORY_ROOT = fromFileUrl(new URL("../../../", import.meta.url));
const BUILD_TOOL_URL = new URL("../tools/build-macos-app.ts", import.meta.url);

interface BuildToolModule {
  createPerryBuildEnvironment(
    environment: Record<string, string>,
    perryLibDirectory: string,
  ): Record<string, string>;
  createInfoPlist(): string;
  createMacAppPlan(repositoryRoot: string, perryLibDirectory: string): {
    appBundle: string;
    executable: string;
    entryPoint: string;
    perryExecutable: string;
    resourcesDirectory: string;
    trayIconDestination: string;
  };
  requirePerryLibDirectory(environment: Record<string, string>): string;
}

Deno.test("desktop tasks expose the signed app build and app-bundle smoke", async () => {
  const rootConfig = JSON.parse(
    await Deno.readTextFile(join(REPOSITORY_ROOT, "deno.json")),
  );
  const desktopConfig = JSON.parse(
    await Deno.readTextFile(join(REPOSITORY_ROOT, "entry/desktop/deno.json")),
  );

  assertEquals(
    rootConfig.tasks["desktop:app"],
    "deno run -A entry/desktop/tools/build-macos-app.ts",
  );
  assertEquals(
    rootConfig.tasks["desktop:app-smoke"],
    "deno run -A entry/desktop/tools/desktop-app-smoke.ts",
  );
  assertEquals(
    desktopConfig.tasks.app,
    "deno run -A tools/build-macos-app.ts",
  );
  assertEquals(
    desktopConfig.tasks["app-smoke"],
    "deno run -A tools/desktop-app-smoke.ts",
  );
});

Deno.test("macOS app plan uses the pinned Perry CLI and canonical bundle layout", async () => {
  const builder = await loadBuildTool();
  const plan = builder.createMacAppPlan("/repo", "/perry/release");

  assertEquals(plan.appBundle, "/repo/dist/OpenFX Node.app");
  assertEquals(
    plan.executable,
    "/repo/dist/OpenFX Node.app/Contents/MacOS/OpenFX Node",
  );
  assertEquals(plan.entryPoint, "/repo/entry/desktop/src/main.ts");
  assertEquals(plan.perryExecutable, "/perry/release/perry");
  assertEquals(
    plan.resourcesDirectory,
    "/repo/dist/OpenFX Node.app/Contents/Resources",
  );
  assertEquals(
    plan.trayIconDestination,
    "/repo/dist/OpenFX Node.app/Contents/Resources/openfx-tray-template.png",
  );
});

Deno.test("macOS app Info.plist declares the production OpenFX identity", async () => {
  const builder = await loadBuildTool();
  const plist = builder.createInfoPlist();

  assertStringIncludes(
    plist,
    "<key>CFBundleIdentifier</key>\n  <string>com.openfx.node</string>",
  );
  assertStringIncludes(
    plist,
    "<key>CFBundleExecutable</key>\n  <string>OpenFX Node</string>",
  );
  assertStringIncludes(
    plist,
    "<key>CFBundleIconFile</key>\n  <string>OpenFXNode</string>",
  );
  assertStringIncludes(
    plist,
    "<key>LSMinimumSystemVersion</key>\n  <string>13.0</string>",
  );
  assertStringIncludes(plist, "<key>LSUIElement</key>\n  <false/>");
});

Deno.test("macOS app build refuses an implicit or empty Perry runtime", async () => {
  const builder = await loadBuildTool();

  assertThrows(
    () => builder.requirePerryLibDirectory({}),
    Error,
    "PERRY_LIB_DIR",
  );
  assertThrows(
    () => builder.requirePerryLibDirectory({ PERRY_LIB_DIR: "  " }),
    Error,
    "PERRY_LIB_DIR",
  );
  assertEquals(
    builder.requirePerryLibDirectory({ PERRY_LIB_DIR: "/perry/release" }),
    "/perry/release",
  );
});

Deno.test("Perry link environment targets the declared macOS 13 minimum", async () => {
  const builder = await loadBuildTool();
  const environment = builder.createPerryBuildEnvironment(
    { PATH: "/usr/bin", MACOSX_DEPLOYMENT_TARGET: "26.0" },
    "/perry/release",
  );

  assertEquals(environment.PERRY_LIB_DIR, "/perry/release");
  assertEquals(environment.MACOSX_DEPLOYMENT_TARGET, "13.0");
  assertEquals(environment.PATH, "/usr/bin");
});

Deno.test("desktop resources include a tracked transparent FX template icon", async () => {
  const trayPath = join(
    REPOSITORY_ROOT,
    "entry/desktop/assets/openfx-tray-template.png",
  );
  const bytes = await Deno.readFile(trayPath);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];

  assert(bytes.length > 128);
  assert(signature.every((value, index) => bytes[index] === value));

  const traySource = await Deno.readTextFile(
    join(REPOSITORY_ROOT, "entry/desktop/src/ui/tray.ts"),
  );
  assertStringIncludes(
    traySource,
    'export const TRAY_ICON_PATH = "openfx-tray-template.png";',
  );
});

Deno.test("desktop app smoke launches the packaged app executable", async () => {
  const smokeSource = await Deno.readTextFile(
    join(REPOSITORY_ROOT, "entry/desktop/tools/desktop-app-smoke.ts"),
  );

  assertStringIncludes(smokeSource, '"dist/OpenFX Node.app"');
  assertStringIncludes(smokeSource, '"Contents/MacOS/OpenFX Node"');
  assert(!smokeSource.includes("runPerryCompile(MAIN_PATH"));
});

async function loadBuildTool(): Promise<BuildToolModule> {
  try {
    return await import(BUILD_TOOL_URL.href) as BuildToolModule;
  } catch (error) {
    assert(false, `macOS app builder must be importable: ${String(error)}`);
  }
}
