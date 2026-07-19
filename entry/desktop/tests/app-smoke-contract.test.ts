import { assert, assertEquals } from "@std/assert";

const MODULE_URL = new URL("../src/core/app-smoke-contract.ts", import.meta.url);

interface SmokeContractModule {
  deriveDesktopAppSmokeRun(input: {
    testMode: boolean;
    token: string;
    argv: string[];
    launchMarkerPath: string;
    cleanExitMarkerPath: string;
    pid: number;
    executable: string;
  }): {
    token: string;
    pid: number;
    executable: string;
    launchMarkerPath: string;
    cleanExitMarkerPath: string;
  } | null;
  serializeDesktopAppSmokeMarker(
    run: {
      token: string;
      pid: number;
      executable: string;
      launchMarkerPath: string;
      cleanExitMarkerPath: string;
    },
    status: "launched" | "clean-exit",
  ): string;
}

const VALID_TOKEN = "0123456789abcdef0123456789abcdef";

Deno.test("desktop smoke run requires matching test mode environment and argv token", async () => {
  const contract = await loadContract();
  const input = {
    testMode: true,
    token: VALID_TOKEN,
    argv: ["/app/OpenFX Node", "--openfx-smoke-token", VALID_TOKEN],
    launchMarkerPath: "/tmp/openfx-launch.json",
    cleanExitMarkerPath: "/tmp/openfx-clean.json",
    pid: 42,
    executable: "/app/OpenFX Node",
  };

  assertEquals(contract.deriveDesktopAppSmokeRun(input), {
    token: VALID_TOKEN,
    pid: 42,
    executable: "/app/OpenFX Node",
    launchMarkerPath: "/tmp/openfx-launch.json",
    cleanExitMarkerPath: "/tmp/openfx-clean.json",
  });
  assertEquals(contract.deriveDesktopAppSmokeRun({ ...input, testMode: false }), null);
  assertEquals(contract.deriveDesktopAppSmokeRun({ ...input, token: "short" }), null);
  assertEquals(
    contract.deriveDesktopAppSmokeRun({
      ...input,
      argv: ["/app/OpenFX Node", "--openfx-smoke-token", "different"],
    }),
    null,
  );
});

Deno.test("desktop smoke markers bind status to token pid and executable", async () => {
  const contract = await loadContract();
  const run = contract.deriveDesktopAppSmokeRun({
    testMode: true,
    token: VALID_TOKEN,
    argv: ["/app/OpenFX Node", "--openfx-smoke-token", VALID_TOKEN],
    launchMarkerPath: "/tmp/openfx-launch.json",
    cleanExitMarkerPath: "/tmp/openfx-clean.json",
    pid: 42,
    executable: "/app/OpenFX Node",
  });
  assert(run);

  assertEquals(JSON.parse(contract.serializeDesktopAppSmokeMarker(run, "clean-exit")), {
    token: VALID_TOKEN,
    pid: 42,
    executable: "/app/OpenFX Node",
    status: "clean-exit",
  });
});

async function loadContract(): Promise<SmokeContractModule> {
  try {
    return await import(MODULE_URL.href) as SmokeContractModule;
  } catch (error) {
    assert(false, `desktop app smoke contract must be importable: ${String(error)}`);
  }
}
