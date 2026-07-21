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
  const image = await decodeRgbaPng(bytes);
  const cornerIndexes = [
    0,
    image.width - 1,
    (image.height - 1) * image.width,
    image.width * image.height - 1,
  ];
  const transparentPixels = image.alpha.filter((alpha) => alpha === 0).length;
  const visiblePixels = image.alpha.filter((alpha) => alpha > 0).length;

  assertEquals(image.width, 32);
  assertEquals(image.height, 32);
  assert(cornerIndexes.every((index) => image.alpha[index] === 0));
  assert(transparentPixels >= image.alpha.length * 0.6);
  assert(transparentPixels <= image.alpha.length * 0.95);
  assert(visiblePixels >= 48);
  assert(image.alpha.some((alpha) => alpha === 255));

  const vectorSource = await Deno.readTextFile(
    join(REPOSITORY_ROOT, "entry/desktop/assets/openfx-tray-template.svg"),
  ).catch(() => "");
  assertStringIncludes(vectorSource, 'viewBox="0 0 32 32"');
  assertStringIncludes(vectorSource, 'fill="#000000"');

  const traySource = await Deno.readTextFile(
    join(REPOSITORY_ROOT, "entry/desktop/src/ui/tray.ts"),
  );
  assertStringIncludes(
    traySource,
    'export const TRAY_ICON_PATH = "openfx-tray-template.png";',
  );
});

interface DecodedRgbaPng {
  width: number;
  height: number;
  alpha: number[];
}

async function decodeRgbaPng(bytes: Uint8Array): Promise<DecodedRgbaPng> {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  assert(signature.every((value, index) => bytes[index] === value));
  let offset = signature.length;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      assertEquals(data[8], 8, "Tray PNG must use 8-bit channels");
      assertEquals(data[9], 6, "Tray PNG must use RGBA color");
      assertEquals(data[12], 0, "Tray PNG must not be interlaced");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += length + 12;
  }
  assert(width > 0 && height > 0 && idat.length > 0);
  const compressedLength = idat.reduce((sum, chunk) => sum + chunk.length, 0);
  const compressed = new Uint8Array(compressedLength);
  let compressedOffset = 0;
  for (const chunk of idat) {
    compressed.set(chunk, compressedOffset);
    compressedOffset += chunk.length;
  }
  const decompressed = new Uint8Array(
    await new Response(
      new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate")),
    ).arrayBuffer(),
  );
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = new Uint8Array(height * stride);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = decompressed[sourceOffset++];
    for (let column = 0; column < stride; column += 1) {
      const raw = decompressed[sourceOffset++];
      const target = row * stride + column;
      const left = column >= bytesPerPixel ? pixels[target - bytesPerPixel] : 0;
      const up = row > 0 ? pixels[target - stride] : 0;
      const upLeft = row > 0 && column >= bytesPerPixel
        ? pixels[target - stride - bytesPerPixel]
        : 0;
      pixels[target] = unfilterByte(filter, raw, left, up, upLeft);
    }
  }
  const alpha: number[] = [];
  for (let index = 3; index < pixels.length; index += 4) alpha.push(pixels[index]);
  return { width, height, alpha };
}

function unfilterByte(
  filter: number,
  raw: number,
  left: number,
  up: number,
  upLeft: number,
): number {
  if (filter === 0) return raw;
  if (filter === 1) return (raw + left) & 0xff;
  if (filter === 2) return (raw + up) & 0xff;
  if (filter === 3) return (raw + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (raw + paeth(left, up, upLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter: ${filter}`);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

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
