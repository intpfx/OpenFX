import { dirname, fromFileUrl, join, resolve } from "jsr:@std/path@^1.1.4";

import {
  parseVmmapSummary,
  type ProcessMemorySamplingResult,
  type ProcessMemorySnapshot,
  runProcessMemorySampling,
} from "../src/core/process-memory.ts";
import {
  collectAfterCleanupAttempt,
  collectBoundedChild,
} from "./integration-cleanup.ts";
import { validatePerryRuntimeDirectory } from "./perry-runtime-provenance.ts";

const REPOSITORY_ROOT = fromFileUrl(new URL("../../../", import.meta.url));
const APP_BUNDLE_RELATIVE_PATH = "dist/OpenFX Node.app";
const APP_EXECUTABLE_RELATIVE_PATH = "Contents/MacOS/OpenFX Node";
const APP_BUNDLE = join(REPOSITORY_ROOT, APP_BUNDLE_RELATIVE_PATH);
const APP_EXECUTABLE = join(APP_BUNDLE, APP_EXECUTABLE_RELATIVE_PATH);
const APP_INFO_PLIST = join(APP_BUNDLE, "Contents/Info.plist");
const APP_ICON = join(APP_BUNDLE, "Contents/Resources/OpenFXNode.icns");
const HEALTH_URL = "http://[::1]:24531/v1/health";
const PERRY_UI_ARCHIVE = "libperry_ui_macos.a";
const HEALTH_TIMEOUT_MS = 10_000;
const APP_EXIT_DEADLINE_MS = 13_000;
const TERMINATION_GRACE_MS = 1_000;
const GRACEFUL_QUIT_TIMEOUT_MS = 5_000;
const INSTANCE_IDENTITY_TIMEOUT_MS = 5_000;
const SMOKE_TOKEN_FLAG = "--openfx-smoke-token";
const MEMORY_WARMUP_MS = 30_000;
const MEMORY_SAMPLE_INTERVAL_MS = 30_000;
const MEMORY_SAMPLE_COUNT = 20;
const MEMORY_TEST_EXIT_AFTER_MS = MEMORY_WARMUP_MS +
  MEMORY_SAMPLE_INTERVAL_MS * MEMORY_SAMPLE_COUNT +
  60_000;
const IO_ACCELERATOR_REGION_GROWTH_LIMIT = 0;
const IO_ACCELERATOR_VIRTUAL_GROWTH_LIMIT_BYTES = 64 * 1024 ** 2;
const IO_ACCELERATOR_RESIDENT_GROWTH_LIMIT_BYTES = 16 * 1024 ** 2;
const PHYSICAL_FOOTPRINT_GROWTH_LIMIT_BYTES = 96 * 1024 ** 2;

const memoryMode = Deno.args.includes("--memory");

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

await validatePerryRuntimeDirectory(perryLibDirectory);
await assertFile(perryExecutable);
await assertFile(join(perryLibDirectory, PERRY_UI_ARCHIVE));
await assertNonEmptyFile(APP_EXECUTABLE);
await assertNonEmptyFile(APP_INFO_PLIST);
await assertNonEmptyFile(APP_ICON);
await verifyAppBundle();
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
  const launchArguments = [
    "-W",
    "-n",
    "--env",
    "PERRY_UI_TEST_MODE=1",
    ...(memoryMode
      ? [
        "--env",
        `PERRY_UI_TEST_EXIT_AFTER_MS=${MEMORY_TEST_EXIT_AFTER_MS}`,
      ]
      : ["--env", "PERRY_UI_TEST_EXIT_AFTER_MS=12000"]),
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
  ];
  const child = new Deno.Command("/usr/bin/open", {
    args: launchArguments,
    cwd: REPOSITORY_ROOT,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  let health: Record<string, unknown> | null = null;
  let failure: unknown = null;
  let instance: VerifiedAppInstance | null = null;
  let memoryResult: ProcessMemorySamplingResult | null = null;
  try {
    instance = await waitForVerifiedAppInstance(
      launchMarker,
      runToken,
      Date.now() + INSTANCE_IDENTITY_TIMEOUT_MS,
    );
    health = await waitForHealth();
    if (!memoryMode) await showVerifiedAppInstance(instance);
    if (memoryMode) {
      memoryResult = await runMemorySmoke(instance);
      if (!memoryResult.passed) {
        throw new Error(formatMemoryDiagnostics(memoryResult));
      }
      await terminateVerifiedAppInstance(instance);
    }
  } catch (error) {
    failure = error;
  }

  const lifecycle = await collectAfterCleanupAttempt(
    failure,
    async () => {
      if (!failure) return;
      instance ??= await findVerifiedAppInstance(runToken);
      if (instance) await terminateVerifiedAppInstance(instance);
    },
    async () => {
      const collected = await collectBoundedChild(child, {
        deadlineAt: memoryMode
          ? Date.now() + APP_EXIT_DEADLINE_MS
          : startedAt + APP_EXIT_DEADLINE_MS,
        terminationGraceMs: TERMINATION_GRACE_MS,
        terminateImmediately: false,
      });
      return collected;
    },
  );
  const lifecycleFailures: AppSmokeFailure[] = [];
  if (lifecycle.cleanupFailure) {
    lifecycleFailures.push({
      stage: "verified PID cleanup",
      error: lifecycle.cleanupFailure,
    });
  }
  if (lifecycle.collectionFailure) {
    lifecycleFailures.push({
      stage: "bounded child collection",
      error: lifecycle.collectionFailure,
    });
  }

  const collected = lifecycle.collected;
  const status = collected?.output ?? null;
  const stdout = status ? new TextDecoder().decode(status.stdout) : "";
  const stderr = status ? new TextDecoder().decode(status.stderr) : "";
  if (collected?.cleanExitTimedOut) {
    lifecycleFailures.push({
      stage: "clean-exit deadline",
      error: new Error(
        `Perry UI app clean-exit timed out after ${APP_EXIT_DEADLINE_MS} ms; ` +
          "the Launch Services child was bounded and reaped.",
      ),
    });
  }
  if (collected?.cleanExitTimedOut || lifecycle.collectionFailure) {
    try {
      instance ??= await findVerifiedAppInstance(runToken);
      if (instance) await terminateVerifiedAppInstance(instance);
    } catch (error) {
      lifecycleFailures.push({
        stage: "verified PID post-collection cleanup",
        error,
      });
    }
  }

  let cleanExitVerified = false;
  if (instance) {
    try {
      await assertVerifiedCleanExit(instance, cleanExitMarker);
      cleanExitVerified = true;
    } catch (error) {
      lifecycleFailures.push({ stage: "clean-exit verification", error });
    }
  }
  if (lifecycle.primaryFailure) {
    lifecycleFailures.unshift({
      stage: "primary smoke failure",
      error: lifecycle.primaryFailure,
    });
  }
  if (status && !status.success) {
    lifecycleFailures.push({
      stage: "Launch Services child status",
      error: new Error(`Perry UI app exited with status ${status.code}.`),
    });
  }
  if (lifecycleFailures.length > 0) {
    throw new Error(formatAppSmokeFailures(lifecycleFailures, stdout, stderr));
  }
  assert(instance, "OpenFX Node app instance identity was not observed.");
  assert(cleanExitVerified, "OpenFX Node app clean exit was not verified.");
  assert(
    health?.ok === true && health.protocolVersion === 1,
    `Unexpected health payload: ${JSON.stringify(health)}`,
  );
  if (!memoryMode) {
    await assertPng(screenshot);
    if (screenshotArtifact) {
      await Deno.mkdir(dirname(screenshotArtifact), { recursive: true });
      await Deno.copyFile(screenshot, screenshotArtifact);
    }
  }
  const screenshotDetails = memoryMode
    ? ""
    : ` screenshot=${screenshotArtifact ?? screenshot}`;
  console.log(
    `[openfx:desktop-app-smoke] PASS app=${APP_BUNDLE} health=${HEALTH_URL}${screenshotDetails}${
      memoryResult ? `\n${formatMemoryDiagnostics(memoryResult)}` : ""
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

interface AppSmokeFailure {
  stage: string;
  error: unknown;
}

async function runMemorySmoke(
  instance: VerifiedAppInstance,
): Promise<ProcessMemorySamplingResult> {
  await delay(MEMORY_WARMUP_MS);
  return await runProcessMemorySampling({
    sampleCount: MEMORY_SAMPLE_COUNT,
    sampleIntervalMs: MEMORY_SAMPLE_INTERVAL_MS,
    ioAcceleratorRegionGrowthLimit: IO_ACCELERATOR_REGION_GROWTH_LIMIT,
    ioAcceleratorVirtualGrowthLimitBytes: IO_ACCELERATOR_VIRTUAL_GROWTH_LIMIT_BYTES,
    ioAcceleratorResidentGrowthLimitBytes: IO_ACCELERATOR_RESIDENT_GROWTH_LIMIT_BYTES,
    physicalFootprintGrowthLimitBytes: PHYSICAL_FOOTPRINT_GROWTH_LIMIT_BYTES,
    delay,
    sample: (index) => sampleProcessMemory(instance, index),
  });
}

async function sampleProcessMemory(
  instance: VerifiedAppInstance,
  index: number,
): Promise<ProcessMemorySnapshot> {
  await verifyAppInstance(instance);
  const result = await new Deno.Command("/usr/bin/vmmap", {
    args: ["-summary", String(instance.pid)],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(
      `vmmap sample ${index} failed with status ${result.code}: ` +
        new TextDecoder().decode(result.stderr).trim(),
    );
  }
  return parseVmmapSummary(new TextDecoder().decode(result.stdout));
}

function formatMemoryDiagnostics(result: ProcessMemorySamplingResult): string {
  return `[openfx:desktop-memory-smoke] ${result.passed ? "PASS" : "FAIL"} ` +
    `baseline=${JSON.stringify(result.baseline)} ` +
    `peak=${JSON.stringify(result.peak)} ` +
    `final=${JSON.stringify(result.final)} ` +
    `failure=${JSON.stringify(result.failure)} ` +
    `reason=${result.reason ?? "none"}`;
}

function formatAppSmokeFailures(
  failures: AppSmokeFailure[],
  stdout: string,
  stderr: string,
): string {
  const details = failures.map(({ stage, error }) =>
    `${stage}: ${error instanceof Error ? error.message : String(error)}`
  ).join("\n");
  return `${details}\nstdout:\n${stdout}\nstderr:\n${stderr}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

async function showVerifiedAppInstance(
  instance: VerifiedAppInstance,
): Promise<void> {
  await verifyAppInstance(instance);
  const result = await new Deno.Command("/usr/bin/open", {
    args: [APP_BUNDLE],
    cwd: REPOSITORY_ROOT,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(
      `Unable to show verified OpenFX Node app (${result.code}): ${
        new TextDecoder().decode(result.stderr).trim() || "no command output"
      }`,
    );
  }
  await verifyAppInstance(instance);
}

async function terminateVerifiedAppInstance(
  instance: VerifiedAppInstance,
): Promise<void> {
  if (!(await isPidAlive(instance.pid))) return;
  await verifyAppInstance(instance);

  let gracefulQuitFailure: unknown = null;
  try {
    const quit = await new Deno.Command("/usr/bin/osascript", {
      args: [
        "-e",
        'tell application id "com.openfx.node" to quit',
      ],
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!quit.success) {
      const stderr = new TextDecoder().decode(quit.stderr).trim();
      throw new Error(
        `OpenFX Node graceful quit failed with status ${quit.code}: ${
          stderr || "no command output"
        }`,
      );
    }
    if (
      await waitForPidExit(
        instance.pid,
        Date.now() + GRACEFUL_QUIT_TIMEOUT_MS,
      )
    ) return;
    gracefulQuitFailure = new Error(
      `OpenFX Node graceful quit timed out after ${GRACEFUL_QUIT_TIMEOUT_MS} ms.`,
    );
  } catch (error) {
    gracefulQuitFailure = error;
  }

  await verifyAppInstance(instance);
  try {
    Deno.kill(instance.pid, "SIGTERM");
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  if (!(await waitForPidExit(instance.pid, Date.now() + TERMINATION_GRACE_MS))) {
    await verifyAppInstance(instance);
    Deno.kill(instance.pid, "SIGKILL");
    assert(
      await waitForPidExit(instance.pid, Date.now() + TERMINATION_GRACE_MS),
      `Unable to terminate verified OpenFX Node app PID ${instance.pid}.`,
    );
  }
  throw gracefulQuitFailure;
}

async function assertVerifiedCleanExit(
  instance: VerifiedAppInstance | null,
  markerPath: string,
): Promise<void> {
  assert(instance, "OpenFX Node app instance identity was not observed.");
  await assertCleanExitMarker(markerPath, instance);
  assert(
    await waitForPidExit(instance.pid, Date.now() + TERMINATION_GRACE_MS),
    `OpenFX Node app process ${instance.pid} remained alive after clean exit.`,
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
    const stderr = new TextDecoder().decode(result.stderr).trim();
    const stdout = new TextDecoder().decode(result.stdout).trim();
    const diagnostics = stderr || stdout || "no command output";
    throw new Error(
      `${command} exited with status ${result.code}: ${diagnostics}`,
    );
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
