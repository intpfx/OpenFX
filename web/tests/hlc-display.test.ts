import { expect } from "@std/expect";
import {
  assertHlcDisplayImageBudget,
  createHlcDisplayHtml,
  HLC_DISPLAY_IMAGE_BUDGET_BYTES,
  HLC_DISPLAY_RUNTIME_FILES,
  isHlcDisplayImageFile,
} from "../../domains/hlc/tools/build-display-app.ts";
import {
  getWebPublicationTarget,
  WEB_DEV_PROXY_PATHS,
} from "../publication-targets.ts";

const HLC_ROOT = new URL("../../domains/hlc/", import.meta.url);

Deno.test("HLC is published at /hlc/ as a display-only same-origin app", async () => {
  const entry = await Deno.readTextFile(
    new URL("public/hlc/display-entry.js", HLC_ROOT),
  );
  const html = createHlcDisplayHtml(`
    <html lang="zh-CN">
      <head>
        <base href="\${currentOrigin}">
        <meta name="start_url" content="/">
        <link rel="stylesheet" href="style.css">
      </head>
      <body>
        <header></header>
        <section id="scene_viewport">
          <picture>
            <source srcset="/imgs/community-map.webp" type="image/webp">
            <img src="/imgs/community-map.png">
          </picture>
          <img data-src="/imgs/community-map-detail-v1.png">
        </section>
        <script type="module" src="main.js"></script>
      </body>
    </html>
  `);

  expect(html).toContain('data-hlc-runtime="display-only"');
  expect(html).toContain('<base href="/hlc/">');
  expect(html).toContain('src="./display-entry.js"');
  expect(html).not.toContain('src="main.js"');
  expect(html).not.toContain('id="community_account_trigger"');
  expect(html).not.toContain('src="/imgs/');
  expect(html).not.toContain('data-src="/imgs/');
  expect(html).toContain('src="./imgs/community-map.webp"');
  expect(html).toContain('data-src="./imgs/community-map-detail-v1.webp"');
  expect(html).not.toContain(".png");

  expect(entry).toContain("installHlcDisplayRuntime");
  expect(entry).toContain('import("./community-map.js")');
  expect(entry).not.toMatch(/fetch\s*\(/);
  expect(entry).not.toMatch(/cookie|session|login|register/i);
  expect(entry).not.toContain("main.js");
  expect(entry).not.toContain("index.js");

  expect(HLC_DISPLAY_RUNTIME_FILES).toContain("community-map.js");
  expect(HLC_DISPLAY_RUNTIME_FILES).toContain("community-display-runtime.js");
  expect(HLC_DISPLAY_RUNTIME_FILES).not.toContain("community-auth-model.js");
  expect(HLC_DISPLAY_RUNTIME_FILES).not.toContain("divertor.js");

  expect(isHlcDisplayImageFile("community-map.webp")).toBe(true);
  expect(isHlcDisplayImageFile("community-map-detail-v1.webp")).toBe(true);
  expect(isHlcDisplayImageFile("community-map.png")).toBe(false);
  expect(isHlcDisplayImageFile("bg.jpg")).toBe(false);

  const target = getWebPublicationTarget("hlc");
  expect(target.baseURL).toBe("/hlc");
  expect(target.directory.pathname).toMatch(/\/web\/\.hlc-public$/);
  expect(target.preparation).toBe("hlc-display");
  expect(WEB_DEV_PROXY_PATHS).toContain("/hlc");
});

Deno.test("HLC display image payload stays within the deploy budget", () => {
  expect(() => assertHlcDisplayImageBudget(HLC_DISPLAY_IMAGE_BUDGET_BYTES))
    .not.toThrow();
  expect(() => assertHlcDisplayImageBudget(HLC_DISPLAY_IMAGE_BUDGET_BYTES + 1))
    .toThrow(/HLC display images exceed 8 MiB/);
});
