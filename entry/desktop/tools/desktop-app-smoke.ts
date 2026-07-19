import { fromFileUrl, join } from "jsr:@std/path@^1.1.4";

import { collectBoundedChild } from "./integration-cleanup.ts";

const REPOSITORY_ROOT = fromFileUrl(new URL("../../../", import.meta.url));
const MAIN_PATH = join(REPOSITORY_ROOT, "entry/desktop/src/main.ts");
const HEALTH_URL = "http://[::1]:24531/v1/health";
const PERRY_UI_ARCHIVE = "libperry_ui_macos.a";
const HEALTH_TIMEOUT_MS = 10_000;
const APP_EXIT_DEADLINE_MS = 13_000;
const TERMINATION_GRACE_MS = 1_000;

const perryLibDirectory = Deno.env.get("PERRY_LIB_DIR")?.trim();
if (!perryLibDirectory) {
  throw new Error(
    "desktop:app-smoke requires PERRY_LIB_DIR from deno task perry:runtime.",
  );
}

await assertFile(join(perryLibDirectory, PERRY_UI_ARCHIVE));
await assertPortAvailable();

const temporaryDirectory = await Deno.makeTempDir({ prefix: "openfx-app-smoke-" });
const executable = join(temporaryDirectory, "openfx-desktop");
const screenshot = join(temporaryDirectory, "openfx-desktop.png");
const uiOnlySource = join(temporaryDirectory, "openfx-ui-only-link.ts");
const uiOnlyExecutable = join(temporaryDirectory, "openfx-ui-only-link");

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
  await runPerryCompile(MAIN_PATH, executable, perryLibDirectory);
  const startedAt = Date.now();
  const child = new Deno.Command("/usr/bin/env", {
    args: [executable],
    cwd: REPOSITORY_ROOT,
    env: {
      ...Deno.env.toObject(),
      PERRY_LIB_DIR: perryLibDirectory,
      PERRY_UI_TEST_MODE: "1",
      PERRY_UI_TEST_EXIT_AFTER_MS: "12000",
      PERRY_UI_SCREENSHOT_PATH: screenshot,
    },
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  let health: Record<string, unknown> | null = null;
  let failure: unknown = null;
  try {
    health = await waitForHealth();
  } catch (error) {
    failure = error;
  }

  const collected = await collectBoundedChild(child, {
    deadlineAt: startedAt + APP_EXIT_DEADLINE_MS,
    terminationGraceMs: TERMINATION_GRACE_MS,
    terminateImmediately: failure !== null,
  });
  const status = collected.output;
  const stdout = new TextDecoder().decode(collected.output.stdout);
  const stderr = new TextDecoder().decode(collected.output.stderr);
  if (collected.cleanExitTimedOut) {
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
  assert(
    health?.ok === true && health.protocolVersion === 1,
    `Unexpected health payload: ${JSON.stringify(health)}`,
  );
  await assertPng(screenshot);
  console.log(
    `[openfx:desktop-app-smoke] PASS health=${HEALTH_URL} screenshot=${screenshot}`,
  );
} finally {
  await Deno.remove(temporaryDirectory, { recursive: true }).catch(() => {});
}

async function runPerryCompile(
  input: string,
  output: string,
  libraryDirectory: string,
): Promise<void> {
  const result = await new Deno.Command("perry", {
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
