import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { join } from "jsr:@std/path@^1.1.4";

import {
  assertPinnedPerrySourceState,
  PERRY_RUNTIME_PROVENANCE_FILENAME,
  PINNED_PERRY_COMMIT,
  PINNED_PERRY_PATCH_SHA256,
  PINNED_PERRY_RUST_TOOLCHAIN,
  REQUIRED_PERRY_RUNTIME_ARTIFACTS,
  validatePerryRuntimeDirectory,
  writePerryRuntimeProvenance,
} from "../tools/perry-runtime-provenance.ts";

Deno.test("pinned Perry source rejects a dirty or wrong revision before patching", () => {
  assertThrows(
    () => assertPinnedPerrySourceState("wrong", ""),
    Error,
    PINNED_PERRY_COMMIT,
  );
  assertThrows(
    () => assertPinnedPerrySourceState(PINNED_PERRY_COMMIT, " M Cargo.toml"),
    Error,
    "clean",
  );
  assertEquals(assertPinnedPerrySourceState(PINNED_PERRY_COMMIT, ""), undefined);
});

Deno.test("runtime provenance validates exact pin fields and actual artifacts", async () => {
  await withRuntimeDirectory(async (directory) => {
    await writePerryRuntimeProvenance(directory);
    const provenance = await validatePerryRuntimeDirectory(directory);
    assertEquals(provenance.perryCommit, PINNED_PERRY_COMMIT);
    assertEquals(provenance.rustToolchain, PINNED_PERRY_RUST_TOOLCHAIN);
    assertEquals(provenance.patchSha256, PINNED_PERRY_PATCH_SHA256);
    assertEquals(
      Object.keys(provenance.artifacts).sort(),
      [...REQUIRED_PERRY_RUNTIME_ARTIFACTS].sort(),
    );
  });
});

Deno.test("runtime provenance fails closed when its manifest is missing", async () => {
  await withRuntimeDirectory(async (directory) => {
    await assertRejects(
      () => validatePerryRuntimeDirectory(directory),
      Error,
      PERRY_RUNTIME_PROVENANCE_FILENAME,
    );
  });
});

Deno.test("runtime provenance rejects wrong commit, toolchain, and patch hash", async () => {
  for (const field of ["perryCommit", "rustToolchain", "patchSha256"] as const) {
    await withRuntimeDirectory(async (directory) => {
      const provenance = await writePerryRuntimeProvenance(directory);
      await Deno.writeTextFile(
        join(directory, PERRY_RUNTIME_PROVENANCE_FILENAME),
        JSON.stringify({ ...provenance, [field]: "invalid" }),
      );
      await assertRejects(
        () => validatePerryRuntimeDirectory(directory),
        Error,
        field,
      );
    });
  }
});

Deno.test("runtime provenance rejects an artifact changed after the pinned build", async () => {
  await withRuntimeDirectory(async (directory) => {
    await writePerryRuntimeProvenance(directory);
    await Deno.writeTextFile(join(directory, "libperry_stdlib.a"), "tampered");
    await assertRejects(
      () => validatePerryRuntimeDirectory(directory),
      Error,
      "libperry_stdlib.a",
    );
  });
});

async function withRuntimeDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await Deno.makeTempDir({ prefix: "openfx-perry-runtime-" });
  try {
    for (const artifact of REQUIRED_PERRY_RUNTIME_ARTIFACTS) {
      await Deno.writeTextFile(join(directory, artifact), `artifact:${artifact}`);
    }
    await run(directory);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}
