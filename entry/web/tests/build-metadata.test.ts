import { expect } from "@std/expect";

import { createBuildMetadata } from "../tools/build-with-metadata.ts";

Deno.test("createBuildMetadata preserves explicit CI metadata", () => {
  const metadata = createBuildMetadata({
    VITE_OPENFX_BUILD_HASH: "abc1234",
    VITE_OPENFX_BUILD_TIME: "2026-06-30T10:38:58Z",
  }, {
    gitHash: "ignored",
    now: new Date("2026-01-01T00:00:00Z"),
  });

  expect(metadata).toEqual({
    hash: "abc1234",
    time: "2026-06-30T10:38:58Z",
  });
});

Deno.test("createBuildMetadata falls back to git hash and current time", () => {
  const metadata = createBuildMetadata({}, {
    gitHash: "5ce254c",
    now: new Date("2026-06-30T10:38:41.123Z"),
  });

  expect(metadata).toEqual({
    hash: "5ce254c",
    time: "2026-06-30T10:38:41Z",
  });
});

Deno.test("createBuildMetadata falls back to Deno Deploy build id without git", () => {
  const metadata = createBuildMetadata({
    DENO_DEPLOY_BUILD_ID: "01234567-abcdef",
  }, {
    now: new Date("2026-06-30T10:38:41Z"),
  });

  expect(metadata).toEqual({
    hash: "0123456",
    time: "2026-06-30T10:38:41Z",
  });
});
