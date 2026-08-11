import { expect } from "@std/expect";

import {
  isMediaPlayerReadMethod,
  resolveMediaPlayerShell,
} from "../server/media-player-route.ts";

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

Deno.test("media-player assets fall through to the minimal shell route", async () => {
  const nitroConfig = await Deno.readTextFile(
    new URL("../nitro.config.ts", import.meta.url),
  );

  expect(nitroConfig).toContain('baseURL: "/media-player"');
  expect(nitroConfig).toContain("fallthrough: true");
  expect(nitroConfig).toContain('baseName: "media-player"');
  expect(nitroConfig).toContain('pattern: "**/*.html"');
  expect(nitroConfig).not.toContain('baseURL: "/playsvideo"');
});
