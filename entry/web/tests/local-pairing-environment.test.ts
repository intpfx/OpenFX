import { expect } from "@std/expect";

import { createLocalWebEnvironment } from "../tools/local-pairing-environment.ts";

Deno.test("local pairing child environment removes inherited auth and production overrides", () => {
  const inherited = {
    OPENFX_ADMIN_KEY: "must-not-leak",
    DENO_DEPLOYMENT_ID: "must-not-leak",
    NODE_ENV: " Production ",
    PATH: "/usr/bin",
  };
  const snapshot = structuredClone(inherited);

  const result = createLocalWebEnvironment(
    inherited,
    "/tmp/openfx-local",
    "0123456789abcdef0123456789abcdef",
  );

  expect(result).toEqual({
    PATH: "/usr/bin",
    DENO_DIR: "/tmp/openfx-local/deno-dir",
    OPENFX_NODE_CREDENTIAL_KEY: "0123456789abcdef0123456789abcdef",
  });
  expect(inherited).toEqual(snapshot);
});

Deno.test("local pairing child environment preserves non-production NODE_ENV", () => {
  const result = createLocalWebEnvironment(
    {
      OPENFX_ADMIN_KEY: "must-not-leak",
      DENO_DEPLOYMENT_ID: "must-not-leak",
      NODE_ENV: "development",
      PATH: "/usr/bin",
    },
    "/tmp/openfx-local",
    "0123456789abcdef0123456789abcdef",
  );

  expect(result).toEqual({
    NODE_ENV: "development",
    PATH: "/usr/bin",
    DENO_DIR: "/tmp/openfx-local/deno-dir",
    OPENFX_NODE_CREDENTIAL_KEY: "0123456789abcdef0123456789abcdef",
  });
});
