import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
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
    rootConfig.tasks["desktop:memory-smoke"],
    "deno run -A entry/desktop/tools/desktop-app-smoke.ts --memory",
  );
  assertEquals(
    desktopConfig.tasks.app,
    "deno run -A tools/build-macos-app.ts",
  );
  assertEquals(
    desktopConfig.tasks["app-smoke"],
    "deno run -A tools/desktop-app-smoke.ts",
  );
  assertEquals(
    desktopConfig.tasks["memory-smoke"],
    "deno run -A tools/desktop-app-smoke.ts --memory",
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

Deno.test("desktop app smoke launches the packaged app executable", async () => {
  const smokeSource = await Deno.readTextFile(
    join(REPOSITORY_ROOT, "entry/desktop/tools/desktop-app-smoke.ts"),
  );

  assertStringIncludes(smokeSource, '"dist/OpenFX Node.app"');
  assertStringIncludes(smokeSource, '"Contents/MacOS/OpenFX Node"');
  assert(!smokeSource.includes("runPerryCompile(MAIN_PATH"));
});

Deno.test("desktop memory smoke uses the exact native growth gate", async () => {
  const smokeSource = await Deno.readTextFile(
    join(REPOSITORY_ROOT, "entry/desktop/tools/desktop-app-smoke.ts"),
  );

  assertStringIncludes(smokeSource, "const MEMORY_WARMUP_MS = 30_000;");
  assertStringIncludes(smokeSource, "const MEMORY_SAMPLE_INTERVAL_MS = 30_000;");
  assertStringIncludes(smokeSource, "const MEMORY_SAMPLE_COUNT = 20;");
  assertStringIncludes(
    smokeSource,
    "const IO_ACCELERATOR_VIRTUAL_GROWTH_LIMIT_BYTES = 64 * 1024 ** 2;",
  );
  assertStringIncludes(
    smokeSource,
    "const PHYSICAL_FOOTPRINT_GROWTH_LIMIT_BYTES = 96 * 1024 ** 2;",
  );
  assertStringIncludes(
    smokeSource,
    'new Deno.Command("/usr/bin/vmmap", {',
  );
  assertStringIncludes(smokeSource, 'args: ["-summary", String(instance.pid)]');
});

Deno.test("desktop memory smoke requires clean exit before reporting failure", async () => {
  const smokeSource = await Deno.readTextFile(
    join(REPOSITORY_ROOT, "entry/desktop/tools/desktop-app-smoke.ts"),
  );
  const collectionIndex = smokeSource.indexOf(
    "const collected = await collectBoundedChild",
  );
  const cleanExitIndex = smokeSource.indexOf(
    "await assertVerifiedCleanExit(instance, cleanExitMarker);",
  );
  const failureIndex = smokeSource.indexOf(
    "if (lifecycle.primaryFailure)",
    collectionIndex,
  );

  assertStringIncludes(smokeSource, "collectAfterCleanupAttempt");
  assert(collectionIndex >= 0);
  assert(cleanExitIndex > collectionIndex);
  assert(failureIndex > cleanExitIndex);
});

async function loadBuildTool(): Promise<BuildToolModule> {
  try {
    return await import(BUILD_TOOL_URL.href) as BuildToolModule;
  } catch (error) {
    assert(false, `macOS app builder must be importable: ${String(error)}`);
  }
}
