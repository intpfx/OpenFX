import { dirname, fromFileUrl, join, resolve } from "jsr:@std/path@^1.1.4";
import {
  assertPinnedPerryPatch,
  assertPinnedPerrySourceState,
  PINNED_PERRY_RUST_TOOLCHAIN,
  PINNED_PERRY_VERSION,
  REQUIRED_PERRY_RUNTIME_ARTIFACTS,
  validatePerryRuntimeDirectory,
  writePerryRuntimeProvenance,
} from "./perry-runtime-provenance.ts";

const PATCH_PATH = fromFileUrl(
  new URL("../perry/perry-v0.5.1220-openfx.patch", import.meta.url),
);
const BUILD_FEATURES = [
  "perry-runtime/full",
  "perry-stdlib/async-runtime",
  "perry-stdlib/bundled-streams",
  "perry-stdlib/crypto",
  "perry-stdlib/database-sqlite",
  "perry-stdlib/external-http-client-pump",
  "perry-stdlib/external-http-server-pump",
  "perry-stdlib/external-ws-pump",
  "perry-runtime/regex-engine",
  "perry-runtime/url-engine",
  "perry-runtime/diagnostics",
].join(",");

const args = parseArgs(Deno.args);
if (!args.source) {
  throw new Error(
    `Usage: deno task perry:runtime --source /path/to/Perry-${PINNED_PERRY_VERSION} [--target-dir /path/to/target]`,
  );
}

const source = resolve(args.source);
const targetDir = resolve(
  args.targetDir ?? join(source, "target", "openfx-v0.5.1220"),
);
const manifest = join(source, "Cargo.toml");
if (!(await exists(manifest))) throw new Error(`Perry source not found: ${source}`);

const commit = (await output("git", ["-C", source, "rev-parse", "HEAD"])).trim();
const status = await output("git", [
  "-C",
  source,
  "status",
  "--porcelain=v1",
  "--untracked-files=all",
]);
assertPinnedPerrySourceState(commit, status);
await assertPinnedPerryPatch(PATCH_PATH);
await run("git", [
  "-C",
  source,
  "apply",
  "--unidiff-zero",
  "--check",
  PATCH_PATH,
]);
await run("git", ["-C", source, "apply", "--unidiff-zero", PATCH_PATH]);
console.log(`[openfx:perry] applied ${PATCH_PATH}`);

await Deno.mkdir(dirname(targetDir), { recursive: true });
await run(
  "rustup",
  [
    "run",
    PINNED_PERRY_RUST_TOOLCHAIN,
    "cargo",
    "build",
    "--release",
    "-p",
    "perry-runtime-static",
    "-p",
    "perry-stdlib-static",
    "-p",
    "perry-ext-http",
    "-p",
    "perry-ui-macos",
    "--no-default-features",
    "--features",
    BUILD_FEATURES,
    "--target-dir",
    targetDir,
  ],
  source,
);

await run(
  "rustup",
  [
    "run",
    PINNED_PERRY_RUST_TOOLCHAIN,
    "cargo",
    "build",
    "--release",
    "-p",
    "perry",
    "--no-default-features",
    "--features",
    "dev-cli",
    "--target-dir",
    targetDir,
  ],
  source,
);

const libraryDirectory = join(targetDir, "release");
for (const archive of REQUIRED_PERRY_RUNTIME_ARTIFACTS) {
  if (!(await exists(join(libraryDirectory, archive)))) {
    throw new Error(`Pinned Perry archive was not built: ${archive}`);
  }
}
await writePerryRuntimeProvenance(libraryDirectory);
await validatePerryRuntimeDirectory(libraryDirectory);
console.log(`[openfx:perry] runtime ready: ${libraryDirectory}`);
console.log(`export PERRY_LIB_DIR=${shellQuote(libraryDirectory)}`);
console.log(`export PATH=${shellQuote(libraryDirectory)}:"$PATH"`);

interface BuildArgs {
  source?: string;
  targetDir?: string;
}

function parseArgs(values: string[]): BuildArgs {
  const parsed: BuildArgs = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--source") parsed.source = requiredValue(values, ++index, value);
    else if (value === "--target-dir") {
      parsed.targetDir = requiredValue(values, ++index, value);
    } else throw new Error(`Unknown argument: ${value}`);
  }
  return parsed;
}

function requiredValue(values: string[], index: number, flag: string): string {
  const value = values[index]?.trim();
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

async function run(
  command: string,
  commandArgs: string[],
  cwd?: string,
): Promise<void> {
  const status = await new Deno.Command(command, {
    args: commandArgs,
    cwd,
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;
  if (!status.success) {
    throw new Error(`${command} exited with status ${status.code}.`);
  }
}

async function output(command: string, commandArgs: string[]): Promise<string> {
  const result = await new Deno.Command(command, {
    args: commandArgs,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(new TextDecoder().decode(result.stderr).trim());
  }
  return new TextDecoder().decode(result.stdout);
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
