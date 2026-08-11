import { expect } from "@std/expect";

import {
  createNitroPublicAssets,
  createNitroServerAssets,
  PREPARED_WEB_PUBLICATION_TARGETS,
  WEB_DEV_PROXY_PATHS,
  WEB_PUBLICATION_TARGETS,
} from "../publication-targets.ts";

Deno.test("web publication targets drive assets, proxies, and preparations", () => {
  const ids = WEB_PUBLICATION_TARGETS.map((target) => target.id);
  expect(ids).toEqual([
    "client",
    "how-much",
    "wanone",
    "gasmap",
    "finlyzer",
    "hlc",
    "costing-assistant",
    "bewlyscript",
    "media-player",
  ]);
  expect(new Set(WEB_DEV_PROXY_PATHS)).toEqual(
    new Set([
      "/api",
      "/how-much",
      "/wanone",
      "/gasmap",
      "/finlyzer",
      "/hlc",
      "/costing-assistant",
      "/bewlyscript",
      "/media-player",
    ]),
  );
  expect(PREPARED_WEB_PUBLICATION_TARGETS.map((target) => target.id)).toEqual([
    "hlc",
    "media-player",
  ]);
});

Deno.test("publication target adapters preserve Nitro cache and server assets", () => {
  const resolve = (directory: URL) => directory.pathname;
  const publicAssets = createNitroPublicAssets(resolve);
  const media = publicAssets.find((asset) => asset.baseURL === "/media-player");
  expect(media).toMatchObject({ fallthrough: true, maxAge: 0 });
  expect(createNitroServerAssets(resolve)).toEqual([{
    baseName: "media-player",
    pattern: "**/*.html",
    dir: WEB_PUBLICATION_TARGETS.at(-1)?.directory.pathname,
  }]);
});
