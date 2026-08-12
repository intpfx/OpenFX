import { expect } from "@std/expect";

type RootConfig = {
  workspace?: string[];
  tasks?: Record<string, string>;
  deploy?: {
    org?: string;
    app?: string;
    build?: string;
    runtime?: {
      type?: string;
      entrypoint?: string;
      cwd?: string;
    };
  };
};

type WebConfig = {
  tasks?: Record<string, string>;
};

async function readJsonConfig<T>(url: URL): Promise<T> {
  return JSON.parse(await Deno.readTextFile(url)) as T;
}

Deno.test("root config publishes the root-level Web product through Deploy CLI", async () => {
  const config = await readJsonConfig<RootConfig>(
    new URL("../../deno.json", import.meta.url),
  );

  expect(config.workspace).toContain("./web");
  expect(config.workspace).not.toContain("./entry/web");
  expect(config.tasks?.build).toBe(
    "deno task --config web/deno.json build",
  );
  expect(config.tasks?.deploy).toBe("deno deploy .");
  expect(Object.keys(config.tasks ?? {}).some((task) => task.startsWith("web:")))
    .toBe(false);
  expect(config.deploy).toMatchObject({
    org: "universes",
    app: "openfx",
    build: "deno task build",
    runtime: {
      type: "dynamic",
      entrypoint: "web/.output/server/index.ts",
      cwd: ".",
    },
  });
});

Deno.test("Web tasks expose explicit client, server, and full-stack dev commands", async () => {
  const rootConfig = await readJsonConfig<RootConfig>(
    new URL("../../deno.json", import.meta.url),
  );
  const webConfig = await readJsonConfig<WebConfig>(
    new URL("../deno.json", import.meta.url),
  );

  expect(rootConfig.tasks?.dev).toBe(
    "deno task --config web/deno.json dev",
  );
  expect(rootConfig.tasks?.["dev:client"]).toBe(
    "deno task --config web/deno.json dev:client",
  );
  expect(rootConfig.tasks?.["dev:server"]).toBe(
    "deno task --config web/deno.json dev:server",
  );
  expect(rootConfig.tasks?.["test:web"]).toBe(
    "deno task --config web/deno.json test",
  );

  expect(webConfig.tasks?.prepare).toBe(
    "deno task prepare:hlc && deno task prepare:media-player",
  );
  expect(webConfig.tasks?.dev).toContain("deno task prepare");
  expect(webConfig.tasks?.dev).toContain('"deno task dev:client"');
  expect(webConfig.tasks?.dev).toContain('"deno task dev:server"');
  expect(webConfig.tasks?.["dev:client"]).toContain("tools/vite.ts dev");
  expect(webConfig.tasks?.["dev:server"]).toContain("nitropack@2.13.4 dev");
});
