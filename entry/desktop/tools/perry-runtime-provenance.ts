import { join } from "jsr:@std/path@^1.1.4";

export const PINNED_PERRY_VERSION = "v0.5.1220";
export const PINNED_PERRY_COMMIT = "06137858dc8c6f80975238377138f2f948d6ef88";
export const PINNED_PERRY_RUST_TOOLCHAIN = "1.96.1";
export const PINNED_PERRY_PATCH_SHA256 =
  "b386485fe618e399f73741676b441383caaf18ff3b1c16d64af5ab3c1f734617";
export const PERRY_RUNTIME_PROVENANCE_FILENAME = "openfx-perry-runtime-provenance.json";
export const REQUIRED_PERRY_RUNTIME_ARTIFACTS = [
  "perry",
  "libperry_runtime.a",
  "libperry_stdlib.a",
  "libperry_ext_http.a",
  "libperry_ui_macos.a",
] as const;

export interface PerryRuntimeProvenance {
  schemaVersion: 1;
  perryVersion: string;
  perryCommit: string;
  rustToolchain: string;
  patchSha256: string;
  artifacts: Record<string, string>;
}

export function assertPinnedPerrySourceState(
  commit: string,
  status: string,
): void {
  if (commit.trim() !== PINNED_PERRY_COMMIT) {
    throw new Error(
      `Expected Perry ${PINNED_PERRY_VERSION} at ${PINNED_PERRY_COMMIT}, ` +
        `received ${commit.trim() || "unknown"}.`,
    );
  }
  if (status.trim()) {
    throw new Error(
      "Pinned Perry source must be clean before applying the OpenFX patch. " +
        `Dirty paths:\n${status.trim()}`,
    );
  }
}

export async function writePerryRuntimeProvenance(
  libraryDirectory: string,
): Promise<PerryRuntimeProvenance> {
  const artifacts: Record<string, string> = {};
  for (const artifact of REQUIRED_PERRY_RUNTIME_ARTIFACTS) {
    artifacts[artifact] = await sha256File(join(libraryDirectory, artifact));
  }
  const provenance: PerryRuntimeProvenance = {
    schemaVersion: 1,
    perryVersion: PINNED_PERRY_VERSION,
    perryCommit: PINNED_PERRY_COMMIT,
    rustToolchain: PINNED_PERRY_RUST_TOOLCHAIN,
    patchSha256: PINNED_PERRY_PATCH_SHA256,
    artifacts,
  };
  const destination = join(
    libraryDirectory,
    PERRY_RUNTIME_PROVENANCE_FILENAME,
  );
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  await Deno.writeTextFile(temporary, `${JSON.stringify(provenance, null, 2)}\n`);
  await Deno.rename(temporary, destination);
  return provenance;
}

export async function validatePerryRuntimeDirectory(
  libraryDirectory: string,
): Promise<PerryRuntimeProvenance> {
  const manifestPath = join(
    libraryDirectory,
    PERRY_RUNTIME_PROVENANCE_FILENAME,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(await Deno.readTextFile(manifestPath));
  } catch (error) {
    throw new Error(
      `Missing or invalid ${PERRY_RUNTIME_PROVENANCE_FILENAME}: ${message(error)}`,
    );
  }
  const provenance = parsePerryRuntimeProvenance(parsed);
  assertExpected("schemaVersion", provenance.schemaVersion, 1);
  assertExpected("perryVersion", provenance.perryVersion, PINNED_PERRY_VERSION);
  assertExpected("perryCommit", provenance.perryCommit, PINNED_PERRY_COMMIT);
  assertExpected(
    "rustToolchain",
    provenance.rustToolchain,
    PINNED_PERRY_RUST_TOOLCHAIN,
  );
  assertExpected(
    "patchSha256",
    provenance.patchSha256,
    PINNED_PERRY_PATCH_SHA256,
  );
  for (const artifact of REQUIRED_PERRY_RUNTIME_ARTIFACTS) {
    const expectedHash = provenance.artifacts[artifact];
    if (!isSha256(expectedHash)) {
      throw new Error(`Invalid provenance hash for ${artifact}.`);
    }
    const actualHash = await sha256File(join(libraryDirectory, artifact));
    if (actualHash !== expectedHash) {
      throw new Error(
        `Pinned Perry artifact hash mismatch for ${artifact}: ` +
          `expected ${expectedHash}, received ${actualHash}.`,
      );
    }
  }
  return provenance;
}

export async function assertPinnedPerryPatch(path: string): Promise<void> {
  const actual = await sha256File(path);
  if (actual !== PINNED_PERRY_PATCH_SHA256) {
    throw new Error(
      `Pinned Perry patch hash mismatch: expected ${PINNED_PERRY_PATCH_SHA256}, ` +
        `received ${actual}.`,
    );
  }
}

export async function sha256File(path: string): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = await Deno.readFile(path);
  } catch (error) {
    throw new Error(`Unable to hash ${path}: ${message(error)}`);
  }
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(
    new Uint8Array(digest),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}

function parsePerryRuntimeProvenance(value: unknown): PerryRuntimeProvenance {
  if (!isRecord(value) || !isRecord(value.artifacts)) {
    throw new Error("Perry runtime provenance must be a JSON object.");
  }
  return {
    schemaVersion: value.schemaVersion as 1,
    perryVersion: stringField(value, "perryVersion"),
    perryCommit: stringField(value, "perryCommit"),
    rustToolchain: stringField(value, "rustToolchain"),
    patchSha256: stringField(value, "patchSha256"),
    artifacts: Object.fromEntries(
      Object.entries(value.artifacts).filter((entry): entry is [string, string] =>
        typeof entry[1] === "string"
      ),
    ),
  };
}

function stringField(value: Record<string, unknown>, field: string): string {
  const result = value[field];
  if (typeof result !== "string") throw new Error(`Invalid ${field} in provenance.`);
  return result;
}

function assertExpected(
  field: string,
  actual: string | number,
  expected: string | number,
): void {
  if (actual !== expected) {
    throw new Error(
      `Invalid provenance ${field}: expected ${expected}, received ${actual}.`,
    );
  }
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
