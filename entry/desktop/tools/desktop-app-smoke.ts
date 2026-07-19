import { dirname, fromFileUrl, join, resolve } from "jsr:@std/path@^1.1.4";

import { collectBoundedChild } from "./integration-cleanup.ts";
import { inspectPngTransparency } from "./png-transparency.ts";

const REPOSITORY_ROOT = fromFileUrl(new URL("../../../", import.meta.url));
const APP_BUNDLE_RELATIVE_PATH = "dist/OpenFX Node.app";
const APP_EXECUTABLE_RELATIVE_PATH = "Contents/MacOS/OpenFX Node";
const APP_BUNDLE = join(REPOSITORY_ROOT, APP_BUNDLE_RELATIVE_PATH);
const APP_EXECUTABLE = join(APP_BUNDLE, APP_EXECUTABLE_RELATIVE_PATH);
const APP_INFO_PLIST = join(APP_BUNDLE, "Contents/Info.plist");
const APP_ICON = join(APP_BUNDLE, "Contents/Resources/OpenFXNode.icns");
const TRAY_ICON = join(
  APP_BUNDLE,
  "Contents/Resources/openfx-tray-template.png",
);
const HEALTH_URL = "http://[::1]:24531/v1/health";
const PERRY_UI_ARCHIVE = "libperry_ui_macos.a";
const HEALTH_TIMEOUT_MS = 10_000;
const APP_EXIT_DEADLINE_MS = 13_000;
const TERMINATION_GRACE_MS = 1_000;
const INSTANCE_IDENTITY_TIMEOUT_MS = 5_000;
const SMOKE_TOKEN_FLAG = "--openfx-smoke-token";

const perryLibDirectory = Deno.env.get("PERRY_LIB_DIR")?.trim();
if (!perryLibDirectory) {
  throw new Error(
    "desktop:app-smoke requires PERRY_LIB_DIR from deno task perry:runtime.",
  );
}
const perryExecutable = join(perryLibDirectory, "perry");
const screenshotArtifactValue = Deno.env.get("PERRY_UI_SCREENSHOT_ARTIFACT")
  ?.trim();
const screenshotArtifact = screenshotArtifactValue
  ? resolve(REPOSITORY_ROOT, screenshotArtifactValue)
  : null;

await assertFile(perryExecutable);
await assertFile(join(perryLibDirectory, PERRY_UI_ARCHIVE));
await assertNonEmptyFile(APP_EXECUTABLE);
await assertNonEmptyFile(APP_INFO_PLIST);
await assertNonEmptyFile(APP_ICON);
await assertNonEmptyFile(TRAY_ICON);
await verifyAppBundle();
await assertTransparentTrayIcon();
await assertPortAvailable();

const temporaryDirectory = await Deno.makeTempDir({ prefix: "openfx-app-smoke-" });
const screenshot = join(temporaryDirectory, "openfx-desktop.png");
const uiOnlySource = join(temporaryDirectory, "openfx-ui-only-link.ts");
const uiOnlyExecutable = join(temporaryDirectory, "openfx-ui-only-link");
const launchMarker = join(temporaryDirectory, "openfx-launch.json");
const cleanExitMarker = join(temporaryDirectory, "openfx-clean-exit.json");
const runToken = crypto.randomUUID().replaceAll("-", "");

try {
  await Deno.writeTextFile(
    uiOnlySource,
    `import { App, Text } from "perry/ui";
App({
  title: "OpenFX UI-only link gate",
  width: 320,
  height: 180,
  body: Text("OpenFX UI-only link gate"),
});
`,
  );
  await runPerryCompile(uiOnlySource, uiOnlyExecutable, perryLibDirectory);
  const startedAt = Date.now();
  const child = new Deno.Command("/usr/bin/open", {
    args: [
      "-W",
      "-n",
      "--env",
      "PERRY_UI_TEST_MODE=1",
      "--env",
      "PERRY_UI_TEST_EXIT_AFTER_MS=12000",
      "--env",
      `PERRY_UI_SCREENSHOT_PATH=${screenshot}`,
      "--env",
      `OPENFX_APP_SMOKE_TOKEN=${runToken}`,
      "--env",
      `OPENFX_APP_SMOKE_LAUNCH_PATH=${launchMarker}`,
      "--env",
      `OPENFX_APP_SMOKE_CLEAN_EXIT_PATH=${cleanExitMarker}`,
      APP_BUNDLE,
      "--args",
      SMOKE_TOKEN_FLAG,
      runToken,
    ],
    cwd: REPOSITORY_ROOT,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  let health: Record<string, unknown> | null = null;
  let failure: unknown = null;
  let instance: VerifiedAppInstance | null = null;
  try {
    instance = await waitForVerifiedAppInstance(
      launchMarker,
      runToken,
      Date.now() + INSTANCE_IDENTITY_TIMEOUT_MS,
    );
    health = await waitForHealth();
  } catch (error) {
    failure = error;
  }

  if (failure) {
    instance ??= await findVerifiedAppInstance(runToken);
    if (instance) await terminateVerifiedAppInstance(instance);
  }

  const collected = await collectBoundedChild(child, {
    deadlineAt: startedAt + APP_EXIT_DEADLINE_MS,
    terminationGraceMs: TERMINATION_GRACE_MS,
    terminateImmediately: false,
  });
  const status = collected.output;
  const stdout = new TextDecoder().decode(collected.output.stdout);
  const stderr = new TextDecoder().decode(collected.output.stderr);
  if (collected.cleanExitTimedOut) {
    instance ??= await findVerifiedAppInstance(runToken);
    if (instance) await terminateVerifiedAppInstance(instance);
    throw new Error(
      `Perry UI app clean-exit timed out after ${APP_EXIT_DEADLINE_MS} ms; ` +
        `sent SIGTERM and escalated to SIGKILL when required.\n` +
        `stdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }
  if (failure) {
    throw new Error(
      `${failure instanceof Error ? failure.message : String(failure)}\n` +
        `stdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }
  if (!status.success) {
    throw new Error(
      `Perry UI app exited with status ${status.code}.\nstdout:\n${stdout}\n` +
        `stderr:\n${stderr}`,
    );
  }
  assert(instance, "OpenFX Node app instance identity was not observed.");
  await assertCleanExitMarker(cleanExitMarker, instance);
  assert(
    await waitForPidExit(instance.pid, Date.now() + TERMINATION_GRACE_MS),
    `OpenFX Node app process ${instance.pid} remained alive after clean exit.`,
  );
  assert(
    health?.ok === true && health.protocolVersion === 1,
    `Unexpected health payload: ${JSON.stringify(health)}`,
  );
  await assertPng(screenshot);
  if (screenshotArtifact) {
    await Deno.mkdir(dirname(screenshotArtifact), { recursive: true });
    await Deno.copyFile(screenshot, screenshotArtifact);
  }
  console.log(
    `[openfx:desktop-app-smoke] PASS app=${APP_BUNDLE} health=${HEALTH_URL} screenshot=${
      screenshotArtifact ?? screenshot
    }`,
  );
} finally {
  await Deno.remove(temporaryDirectory, { recursive: true }).catch(() => {});
}

async function verifyAppBundle(): Promise<void> {
  const fileDescription = await commandOutput("/usr/bin/file", [APP_EXECUTABLE]);
  assert(
    fileDescription.includes("Mach-O 64-bit executable arm64"),
    `Unexpected app executable: ${fileDescription.trim()}`,
  );
  const architectures = (await commandOutput("/usr/bin/lipo", [
    "-archs",
    APP_EXECUTABLE,
  ])).trim();
  assert(
    architectures === "arm64",
    `Expected arm64-only app, received: ${architectures}`,
  );
  const buildVersion = await commandOutput("/usr/bin/vtool", [
    "-show-build",
    APP_EXECUTABLE,
  ]);
  assert(
    /^\s*minos 13\.0\s*$/m.test(buildVersion),
    `Expected macOS 13.0 deployment target.\n${buildVersion.trim()}`,
  );
  await assertCommand("/usr/bin/plutil", ["-lint", APP_INFO_PLIST]);
  await assertPlistValue("CFBundleIdentifier", "com.openfx.node");
  await assertPlistValue("CFBundleExecutable", "OpenFX Node");
  await assertPlistValue("LSMinimumSystemVersion", "13.0");
  await assertPlistValue("CFBundleIconFile", "OpenFXNode");
  await assertCommand("/usr/bin/codesign", [
    "--verify",
    "--deep",
    "--strict",
    APP_BUNDLE,
  ]);
}

async function assertPlistValue(key: string, expected: string): Promise<void> {
  const actual = (await commandOutput("/usr/bin/plutil", [
    "-extract",
    key,
    "raw",
    APP_INFO_PLIST,
  ])).trim();
  assert(actual === expected, `Unexpected ${key}: ${actual}`);
}

async function assertTransparentTrayIcon(): Promise<void> {
  const image = await inspectPngTransparency(await Deno.readFile(TRAY_ICON));
  assert(image.width === 32 && image.height === 32, "Tray icon must be 32 x 32.");
  assert(
    image.cornerAlpha.every((alpha) => alpha === 0),
    `Tray icon corners must be transparent: ${image.cornerAlpha.join(", ")}`,
  );
  assert(
    image.transparentPixels >= image.totalPixels * 0.6 &&
      image.transparentPixels <= image.totalPixels * 0.95,
    `Tray icon transparency is out of range: ${image.transparentPixels}/${image.totalPixels}`,
  );
  assert(image.visiblePixels >= 48, "Tray icon FX glyph is missing.");
  assert(image.opaquePixels > 0, "Tray icon FX glyph has no opaque pixels.");
}

interface AppSmokeMarker {
  token: string;
  pid: number;
  executable: string;
  status: "launched" | "clean-exit";
}

interface VerifiedAppInstance {
  token: string;
  pid: number;
  executable: string;
}

async function waitForVerifiedAppInstance(
  markerPath: string,
  token: string,
  deadlineAt: number,
): Promise<VerifiedAppInstance> {
  let lastError = "launch marker not written";
  while (Date.now() < deadlineAt) {
    try {
      const marker = await readAppSmokeMarker(markerPath);
      assert(
        marker.status === "launched",
        `Unexpected launch status: ${marker.status}`,
      );
      assert(marker.token === token, "Launch marker token does not match this run.");
      const instance = {
        token: marker.token,
        pid: marker.pid,
        executable: marker.executable,
      };
      await verifyAppInstance(instance);
      return instance;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `OpenFX Node app identity timed out after ${INSTANCE_IDENTITY_TIMEOUT_MS} ms (${lastError}).`,
  );
}

async function findVerifiedAppInstance(
  token: string,
): Promise<VerifiedAppInstance | null> {
  const processes = await commandOutput("/bin/ps", ["-axo", "pid=,command="]);
  const matches: VerifiedAppInstance[] = [];
  for (const line of processes.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const command = match[2];
    if (
      !command.includes(APP_EXECUTABLE) ||
      !command.includes(`${SMOKE_TOKEN_FLAG} ${token}`)
    ) continue;
    const instance = { token, pid, executable: APP_EXECUTABLE };
    await verifyAppInstance(instance);
    matches.push(instance);
  }
  assert(matches.length <= 1, `Multiple app processes matched smoke token ${token}.`);
  return matches[0] ?? null;
}

async function verifyAppInstance(instance: VerifiedAppInstance): Promise<void> {
  assert(
    Number.isInteger(instance.pid) && instance.pid > 0,
    `Invalid OpenFX Node app PID: ${instance.pid}`,
  );
  const expectedExecutable = await Deno.realPath(APP_EXECUTABLE);
  const markerExecutable = await Deno.realPath(instance.executable);
  assert(
    markerExecutable === expectedExecutable,
    `App marker executable mismatch: ${markerExecutable}`,
  );
  assert(
    markerExecutable.startsWith(`${await Deno.realPath(APP_BUNDLE)}/Contents/MacOS/`),
    `App executable is outside the expected bundle: ${markerExecutable}`,
  );
  const command = (await commandOutput("/bin/ps", [
    "-p",
    String(instance.pid),
    "-o",
    "command=",
  ])).trim();
  assert(
    command.includes(expectedExecutable),
    `PID ${instance.pid} has another command.`,
  );
  assert(
    command.includes(`${SMOKE_TOKEN_FLAG} ${instance.token}`),
    `PID ${instance.pid} does not own this smoke token.`,
  );
  const openFiles = await commandOutput("/usr/sbin/lsof", [
    "-a",
    "-p",
    String(instance.pid),
    "-d",
    "txt",
    "-Fn",
  ]);
  const textPaths = openFiles.split("\n")
    .filter((line) => line.startsWith("n"))
    .map((line) => line.slice(1));
  assert(
    textPaths.includes(expectedExecutable),
    `PID ${instance.pid} is not mapped to ${expectedExecutable}.`,
  );
}

async function terminateVerifiedAppInstance(
  instance: VerifiedAppInstance,
): Promise<void> {
  if (!(await isPidAlive(instance.pid))) return;
  await verifyAppInstance(instance);
  try {
    Deno.kill(instance.pid, "SIGTERM");
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  if (await waitForPidExit(instance.pid, Date.now() + TERMINATION_GRACE_MS)) return;
  await verifyAppInstance(instance);
  Deno.kill(instance.pid, "SIGKILL");
  assert(
    await waitForPidExit(instance.pid, Date.now() + TERMINATION_GRACE_MS),
    `Unable to terminate verified OpenFX Node app PID ${instance.pid}.`,
  );
}

async function assertCleanExitMarker(
  markerPath: string,
  instance: VerifiedAppInstance,
): Promise<void> {
  const marker = await readAppSmokeMarker(markerPath);
  assert(marker.status === "clean-exit", `Unexpected exit status: ${marker.status}`);
  assert(marker.token === instance.token, "Clean-exit token does not match this run.");
  assert(marker.pid === instance.pid, "Clean-exit PID does not match this run.");
  assert(
    await Deno.realPath(marker.executable) === await Deno.realPath(APP_EXECUTABLE),
    "Clean-exit executable does not match the app bundle.",
  );
}

async function readAppSmokeMarker(path: string): Promise<AppSmokeMarker> {
  const value = JSON.parse(await Deno.readTextFile(path)) as Partial<AppSmokeMarker>;
  assert(typeof value.token === "string", "App marker token is missing.");
  assert(
    typeof value.pid === "number" && Number.isInteger(value.pid) && value.pid > 0,
    "App marker PID is invalid.",
  );
  assert(typeof value.executable === "string", "App marker executable is missing.");
  assert(
    value.status === "launched" || value.status === "clean-exit",
    "App marker status is invalid.",
  );
  return value as AppSmokeMarker;
}

async function waitForPidExit(pid: number, deadlineAt: number): Promise<boolean> {
  while (Date.now() < deadlineAt) {
    if (!(await isPidAlive(pid))) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !(await isPidAlive(pid));
}

async function isPidAlive(pid: number): Promise<boolean> {
  const result = await new Deno.Command("/bin/ps", {
    args: ["-p", String(pid), "-o", "pid="],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  return result.success &&
    new TextDecoder().decode(result.stdout).trim() === String(pid);
}

async function assertCommand(command: string, args: string[]): Promise<void> {
  const result = await new Deno.Command(command, {
    args,
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

async function commandOutput(command: string, args: string[]): Promise<string> {
  const result = await new Deno.Command(command, {
    args,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(new TextDecoder().decode(result.stderr).trim());
  }
  return new TextDecoder().decode(result.stdout);
}

async function runPerryCompile(
  input: string,
  output: string,
  libraryDirectory: string,
): Promise<void> {
  const result = await new Deno.Command(perryExecutable, {
    args: ["compile", input, "-o", output, "--no-auto-optimize"],
    cwd: REPOSITORY_ROOT,
    env: { ...Deno.env.toObject(), PERRY_LIB_DIR: libraryDirectory },
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(
      `Perry compile failed (${result.code}).\n` +
        new TextDecoder().decode(result.stdout) +
        new TextDecoder().decode(result.stderr),
    );
  }
}

async function assertPortAvailable(): Promise<void> {
  try {
    const response = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(300),
    });
    await response.body?.cancel();
    throw new Error(
      "TCP 24531 is already serving HTTP; stop the existing OpenFX Node first.",
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("already serving")) {
      throw error;
    }
  }
}

async function waitForHealth(): Promise<Record<string, unknown>> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastError = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(HEALTH_URL, {
        signal: AbortSignal.timeout(500),
      });
      const body = await response.json() as Record<string, unknown>;
      if (response.status === 200) return body;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Perry UI app health timed out after ${HEALTH_TIMEOUT_MS} ms (${lastError}).`,
  );
}

async function assertFile(path: string): Promise<void> {
  const stat = await Deno.stat(path).catch(() => null);
  assert(stat?.isFile, `Required pinned Perry archive is missing: ${path}`);
}

async function assertNonEmptyFile(path: string): Promise<void> {
  const stat = await Deno.stat(path).catch(() => null);
  assert(
    stat?.isFile && stat.size > 0,
    `Required tracked tray resource is missing or empty: ${path}`,
  );
}

async function assertPng(path: string): Promise<void> {
  const bytes = await Deno.readFile(path);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  assert(bytes.length > 1_024, `Perry UI screenshot is unexpectedly small: ${path}`);
  assert(
    signature.every((value, index) => bytes[index] === value),
    `Perry UI screenshot is not a PNG: ${path}`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
