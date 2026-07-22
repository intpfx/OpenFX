import { expect } from "@std/expect";

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
  expect(launcherSource).toContain('"--location"');
  expect(launcherSource).toContain("LOCAL_WEB_LOCATION");
  expect(launcherSource).not.toContain("/Users/");
  expect(launcherSource).not.toContain(".worktrees/");
  expect(launcherSource).not.toContain("OPENFX_ADMIN_KEY:");
  expect(launcherSource).not.toContain("DENO_DEPLOYMENT_ID:");
});
