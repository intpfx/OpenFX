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

Deno.test("root config publishes the root-level Web product through Deploy CLI", async () => {
  const config = JSON.parse(
    await Deno.readTextFile(new URL("../../deno.json", import.meta.url)),
  ) as RootConfig;

  expect(config.workspace).toContain("./web");
  expect(config.workspace).not.toContain("./entry/web");
  expect(config.tasks?.["web:build"]).toBe(
    "deno task --config web/deno.json build",
  );
  expect(config.tasks?.["web:deploy"]).toBe("deno deploy .");
  expect(config.deploy).toMatchObject({
    org: "universes",
    app: "openfx",
    build: "deno task web:build",
    runtime: {
      type: "dynamic",
      entrypoint: "web/.output/server/index.ts",
      cwd: ".",
    },
  });
});
