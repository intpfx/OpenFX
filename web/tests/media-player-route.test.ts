import { expect } from "@std/expect";

import {
  isMediaPlayerReadMethod,
  resolveMediaPlayerShell,
} from "../server/media-player-route.ts";
import { getWebPublicationTarget } from "../publication-targets.ts";

Deno.test("media-player routes only preserve the minimal player shell", () => {
  expect(resolveMediaPlayerShell("")).toBe("index.html");
  expect(resolveMediaPlayerShell("openfx-file")).toBe("index.html");
  expect(resolveMediaPlayerShell("app")).toBeNull();
  expect(resolveMediaPlayerShell("debug")).toBeNull();
});

Deno.test("media-player route boundary accepts reads and rejects writes", () => {
  expect(isMediaPlayerReadMethod("GET")).toBe(true);
  expect(isMediaPlayerReadMethod("HEAD")).toBe(true);
  expect(isMediaPlayerReadMethod("POST")).toBe(false);
});

Deno.test("media-player assets fall through to the minimal shell route", () => {
  const target = getWebPublicationTarget("media-player");
  expect(target.baseURL).toBe("/media-player");
  expect(target.fallthrough).toBe(true);
  expect(target.serverAsset).toEqual({
    baseName: "media-player",
    pattern: "**/*.html",
  });
});
