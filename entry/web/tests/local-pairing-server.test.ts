import { expect } from "@std/expect";

import { createNitroLifecycle } from "../tools/local-pairing-server.ts";

const webConfigUrl = new URL("../deno.json", import.meta.url);
const rootConfigUrl = new URL("../../../deno.json", import.meta.url);
const launcherUrl = new URL("../tools/local-pairing-server.ts", import.meta.url);

Deno.test("local pairing launcher is wired to a sanitized loopback HTTPS runtime", async () => {
  const [webConfigText, rootConfigText, launcherSource] = await Promise.all([
    Deno.readTextFile(webConfigUrl),
    Deno.readTextFile(rootConfigUrl),
    Deno.readTextFile(launcherUrl),
  ]);
  const webConfig = JSON.parse(webConfigText) as {
    tasks: Record<string, string>;
  };
  const rootConfig = JSON.parse(rootConfigText) as {
    tasks: Record<string, string>;
  };

  expect(webConfig.tasks["local-pairing"]).toBe(
    "deno run --unstable-kv -A tools/local-pairing-server.ts",
  );
  expect(rootConfig.tasks["web:local-pairing"]).toBe(
    "deno task --config entry/web/deno.json local-pairing",
  );
  expect(launcherSource).toContain("LOCAL_ADMIN_KEY");
  expect(launcherSource).toContain("LOCAL_WEB_LOCATION");
  expect(launcherSource).toContain("createLocalWebEnvironment");
  expect(launcherSource).toContain("clearEnv: true");
  expect(launcherSource).toContain("env: childEnvironment");
  expect(launcherSource).toMatch(
    /args:\s*\[\s*"run",\s*"--location",\s*LOCAL_WEB_LOCATION,/s,
  );
  expect(launcherSource).not.toContain("/Users/");
  expect(launcherSource).not.toContain(".worktrees/");
  expect(launcherSource).not.toContain("OPENFX_ADMIN_KEY:");
  expect(launcherSource).not.toContain("DENO_DEPLOYMENT_ID:");
});

Deno.test("local pairing lifecycle rejects a child exit before health becomes ready", async () => {
  const lifecycle = createNitroLifecycle({
    status: Promise.resolve({ success: false, code: 1, signal: null }),
    kill() {},
  });

  await expect(
    lifecycle.raceStartup("waiting for health", new Promise<void>(() => {})),
  ).rejects.toThrow("Nitro exited before waiting for health");
});

Deno.test("local pairing lifecycle cleanup terminates and awaits the child once", async () => {
  let resolveStatus: (status: Deno.CommandStatus) => void;
  const status = new Promise<Deno.CommandStatus>((resolve) => {
    resolveStatus = resolve;
  });
  const signals: Deno.Signal[] = [];
  const lifecycle = createNitroLifecycle({
    status,
    kill(signal?: Deno.Signal) {
      if (signal) signals.push(signal);
    },
  });

  const firstCleanup = lifecycle.stop();
  const secondCleanup = lifecycle.stop();
  expect(secondCleanup).toBe(firstCleanup);
  expect(signals).toEqual(["SIGTERM"]);

  let completed = false;
  void firstCleanup.then(() => {
    completed = true;
  });
  await Promise.resolve();
  expect(completed).toBe(false);

  const finalStatus = { success: false, code: 143, signal: "SIGTERM" } as const;
  resolveStatus!(finalStatus);
  await expect(firstCleanup).resolves.toEqual(finalStatus);
  await expect(lifecycle.waitForFinalStatus()).resolves.toEqual(finalStatus);
});
