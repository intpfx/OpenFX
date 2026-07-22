import { fromFileUrl, join, resolve } from "jsr:@std/path@^1.1.4";
import {
  REQUIRED_PERRY_RUNTIME_ARTIFACTS,
  validatePerryRuntimeDirectory,
} from "./perry-runtime-provenance.ts";

const APP_NAME = "OpenFX Node";
const BUNDLE_IDENTIFIER = "com.openfx.node";
const MINIMUM_MACOS_VERSION = "13.0";
const REPOSITORY_ROOT = fromFileUrl(new URL("../../../", import.meta.url));

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

export function requirePerryLibDirectory(
  environment: Record<string, string>,
): string {
  const value = environment.PERRY_LIB_DIR?.trim();
  if (!value) {
    throw new Error(
      "desktop:app requires PERRY_LIB_DIR from deno task perry:runtime.",
    );
  }
  return resolve(value);
}

export function createMacAppPlan(
  repositoryRoot: string,
  perryLibDirectory: string,
): MacAppPlan {
  const root = resolve(repositoryRoot);
  const libraryDirectory = resolve(perryLibDirectory);
  const appBundle = join(root, "dist", `${APP_NAME}.app`);
  const contentsDirectory = join(appBundle, "Contents");
  const resourcesDirectory = join(contentsDirectory, "Resources");
  return {
    appBundle,
    contentsDirectory,
    executable: join(contentsDirectory, "MacOS", APP_NAME),
    entryPoint: join(root, "entry/desktop/src/main.ts"),
    iconDestination: join(resourcesDirectory, "OpenFXNode.icns"),
    iconSource: join(root, "entry/web/public/openfx-icon-512.png"),
    infoPlist: join(contentsDirectory, "Info.plist"),
    perryExecutable: join(libraryDirectory, "perry"),
    perryLibDirectory: libraryDirectory,
    resourcesDirectory,
  };
}

export function createPerryBuildEnvironment(
  environment: Record<string, string>,
  perryLibDirectory: string,
): Record<string, string> {
  return {
    ...environment,
    PERRY_LIB_DIR: resolve(perryLibDirectory),
    MACOSX_DEPLOYMENT_TARGET: MINIMUM_MACOS_VERSION,
  };
}

export function createInfoPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIconFile</key>
  <string>OpenFXNode</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_IDENTIFIER}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>${MINIMUM_MACOS_VERSION}</string>
  <key>LSUIElement</key>
  <false/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}

async function buildMacApp(): Promise<void> {
  if (Deno.build.os !== "darwin" || Deno.build.arch !== "aarch64") {
    throw new Error(
      `desktop:app requires arm64 macOS; received ${Deno.build.target}.`,
    );
  }
  const perryLibDirectory = requirePerryLibDirectory(Deno.env.toObject());
  const plan = createMacAppPlan(REPOSITORY_ROOT, perryLibDirectory);
  await validateInputs(plan);

  const stagingRoot = await Deno.makeTempDir({
    dir: join(REPOSITORY_ROOT, "dist"),
    prefix: ".openfx-node-app-",
  });
  const stagedBundle = join(stagingRoot, `${APP_NAME}.app`);
  const stagedContents = join(stagedBundle, "Contents");
  const stagedExecutable = join(stagedContents, "MacOS", APP_NAME);
  const stagedResources = join(stagedContents, "Resources");
  const stagedIcon = join(stagedResources, "OpenFXNode.icns");
  const stagedInfoPlist = join(stagedContents, "Info.plist");

  try {
    await Deno.mkdir(join(stagedContents, "MacOS"), { recursive: true });
    await Deno.mkdir(stagedResources, { recursive: true });
    await compilePerry(plan, stagedExecutable);
    await Deno.chmod(stagedExecutable, 0o755);
    await createIcns(plan.iconSource, stagedIcon);
    await Deno.writeTextFile(stagedInfoPlist, createInfoPlist());
    await run("/usr/bin/plutil", ["-lint", stagedInfoPlist]);
    await run("/usr/bin/codesign", [
      "--force",
      "--deep",
      "--sign",
      "-",
      stagedBundle,
    ]);
    await verifyMacApp(stagedBundle, stagedExecutable, stagedInfoPlist);

    await Deno.remove(plan.appBundle, { recursive: true }).catch((error) => {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    });
    await Deno.rename(stagedBundle, plan.appBundle);
    console.log(`[openfx:desktop-app] ready: ${plan.appBundle}`);
  } finally {
    await Deno.remove(stagingRoot, { recursive: true }).catch(() => {});
  }
}

async function validateInputs(plan: MacAppPlan): Promise<void> {
  await validatePerryRuntimeDirectory(plan.perryLibDirectory);
  for (const artifact of REQUIRED_PERRY_RUNTIME_ARTIFACTS) {
    await assertNonEmptyFile(join(plan.perryLibDirectory, artifact));
  }
  await assertNonEmptyFile(plan.entryPoint);
  await assertNonEmptyFile(plan.iconSource);
  await Deno.mkdir(join(REPOSITORY_ROOT, "dist"), { recursive: true });
}

async function compilePerry(
  plan: MacAppPlan,
  outputPath: string,
): Promise<void> {
  await run(
    plan.perryExecutable,
    [
      "compile",
      plan.entryPoint,
      "-o",
      outputPath,
      "--no-auto-optimize",
    ],
    {
      cwd: REPOSITORY_ROOT,
      env: createPerryBuildEnvironment(
        Deno.env.toObject(),
        plan.perryLibDirectory,
      ),
    },
  );
}

async function createIcns(source: string, destination: string): Promise<void> {
  const temporaryDirectory = await Deno.makeTempDir({
    prefix: "openfx-icon-",
  });
  const iconset = join(temporaryDirectory, "OpenFXNode.iconset");
  const variants = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ] as const;
  try {
    await Deno.mkdir(iconset);
    for (const [size, name] of variants) {
      await run("/usr/bin/sips", [
        "-z",
        String(size),
        String(size),
        source,
        "--out",
        join(iconset, name),
      ]);
    }
    await run("/usr/bin/iconutil", [
      "-c",
      "icns",
      "-o",
      destination,
      iconset,
    ]);
  } finally {
    await Deno.remove(temporaryDirectory, { recursive: true }).catch(() => {});
  }
}

async function verifyMacApp(
  appBundle: string,
  executable: string,
  infoPlist: string,
): Promise<void> {
  const fileDescription = await output("/usr/bin/file", [executable]);
  if (!fileDescription.includes("Mach-O 64-bit executable arm64")) {
    throw new Error(`Unexpected desktop executable: ${fileDescription.trim()}`);
  }
  const architectures = (await output("/usr/bin/lipo", [
    "-archs",
    executable,
  ])).trim().split(/\s+/);
  if (architectures.length !== 1 || architectures[0] !== "arm64") {
    throw new Error(`Expected arm64-only app, received: ${architectures.join(" ")}`);
  }
  const buildVersion = await output("/usr/bin/vtool", [
    "-show-build",
    executable,
  ]);
  if (!/^\s*minos 13\.0\s*$/m.test(buildVersion)) {
    throw new Error(
      `Expected macOS 13.0 deployment target.\n${buildVersion.trim()}`,
    );
  }
  await run("/usr/bin/plutil", ["-lint", infoPlist]);
  await verifyPlistValue(infoPlist, "CFBundleIdentifier", BUNDLE_IDENTIFIER);
  await verifyPlistValue(infoPlist, "CFBundleExecutable", APP_NAME);
  await verifyPlistValue(infoPlist, "LSMinimumSystemVersion", MINIMUM_MACOS_VERSION);
  await verifyPlistValue(infoPlist, "CFBundleIconFile", "OpenFXNode");
  await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", appBundle]);
}

async function verifyPlistValue(
  infoPlist: string,
  key: string,
  expected: string,
): Promise<void> {
  const actual = (await output("/usr/bin/plutil", [
    "-extract",
    key,
    "raw",
    infoPlist,
  ])).trim();
  if (actual !== expected) throw new Error(`Unexpected ${key}: ${actual}`);
}

interface CommandOptions {
  cwd?: string;
  env?: Record<string, string>;
}

async function run(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<void> {
  const result = await new Deno.Command(command, {
    args,
    cwd: options.cwd,
    env: options.env,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(
      `${command} exited with status ${result.code}.\n` +
        new TextDecoder().decode(result.stdout) +
        new TextDecoder().decode(result.stderr),
    );
  }
}

async function output(command: string, args: string[]): Promise<string> {
  const result = await new Deno.Command(command, {
    args,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(
      `${command} exited with status ${result.code}: ` +
        new TextDecoder().decode(result.stderr).trim(),
    );
  }
  return new TextDecoder().decode(result.stdout);
}

async function assertNonEmptyFile(path: string): Promise<void> {
  const stat = await Deno.stat(path).catch(() => null);
  if (!stat?.isFile || stat.size === 0) {
    throw new Error(`Required desktop app input is missing or empty: ${path}`);
  }
}

if (import.meta.main) await buildMacApp();
