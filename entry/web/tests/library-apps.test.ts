import { expect } from "@std/expect";

import { LIBRARY_APPS } from "../library-apps.ts";
import { LIBRARY_APP_PANEL_IDS } from "../library-app-panels.ts";
import { DEFAULT_LIBRARY_APPS } from "../src/file-library/default-apps.ts";

Deno.test("the current project entries are built-in file-library Apps", () => {
  const appIds = LIBRARY_APPS.map((app) => app.id);
  const panelIds = new Set<string>(LIBRARY_APP_PANEL_IDS);

  expect(appIds).toHaveLength(13);
  expect(new Set(appIds).size).toBe(appIds.length);
  expect(appIds.filter((id) => !panelIds.has(id))).toEqual([]);

  expect(DEFAULT_LIBRARY_APPS).toHaveLength(13);
  expect(DEFAULT_LIBRARY_APPS.map((item) => item.kind)).toEqual(
    Array.from({ length: 13 }, () => "app"),
  );
  expect(DEFAULT_LIBRARY_APPS.map((item) => item.app?.id)).toEqual(appIds);
});

Deno.test("e is introduced as a runtime-neutral built-in App", async () => {
  const eApp = LIBRARY_APPS.find((app) => app.id === "e-agent-framework");
  const appSource = await Deno.readTextFile(new URL("../src/App.tsx", import.meta.url));

  expect(eApp?.name).toBe("e · Agent 执行框架");
  expect(eApp?.sourcePath).toContain("domains/e/");
  expect(eApp?.tech).toContain("Agent Runtime");
  expect(appSource).toContain('panelId="e-agent-framework"');
  expect(appSource).toContain("运行时无关的 TypeScript Agent 内核");
});

Deno.test("built-in Apps use live previews or stable color tiles without covers", () => {
  const livePreviewIds = [
    "costing-assistant",
    "finlyzer",
    "gasmap",
    "hlc",
    "wanone-memorial",
  ];

  for (const item of DEFAULT_LIBRARY_APPS) {
    expect(item.size).toBe(0);
    expect(item.source.type).toBe("application/x-openfx-app");
    expect(item.app).not.toHaveProperty("cover");
  }

  expect(
    DEFAULT_LIBRARY_APPS.filter((item) => item.app?.preview).map((item) => item.app?.id)
      .sort(),
  ).toEqual(livePreviewIds);
  for (const item of DEFAULT_LIBRARY_APPS.filter((item) => item.app?.preview)) {
    expect(item.app?.preview?.src.startsWith("/")).toBe(true);
    expect(item.app?.preview?.title.length).toBeGreaterThan(0);
  }
});

Deno.test("HLC App opens the same-origin read-only showcase", async () => {
  const hlc = LIBRARY_APPS.find((app) => app.id === "hlc");
  const appSource = await Deno.readTextFile(new URL("../src/App.tsx", import.meta.url));

  expect(hlc?.name).toBe("HLC · 圣灯社区");
  expect(hlc?.sourcePath).toContain("same-origin read-only showcase");
  expect(appSource).toContain('src="/hlc/"');
  expect(appSource).toContain('sandbox="allow-scripts allow-same-origin"');
});

Deno.test("the media player is a file capability rather than a duplicate App", async () => {
  const appSource = await Deno.readTextFile(new URL("../src/App.tsx", import.meta.url));

  expect(LIBRARY_APPS.some((app) => app.id === "playsvideo")).toBe(false);
  expect(appSource).not.toContain('panelId="playsvideo"');
  expect(appSource).not.toContain('href="/playsvideo/');
});

Deno.test("the former projects page and node console no longer exist", async () => {
  const appSource = await Deno.readTextFile(new URL("../src/App.tsx", import.meta.url));
  const librarySource = await Deno.readTextFile(
    new URL("../src/file-library/FileLibraryHomepage.tsx", import.meta.url),
  );

  expect(appSource).not.toContain("ProjectHomepage");
  expect(appSource).not.toContain("view=projects");
  expect(librarySource).not.toContain("view=projects");
  expect(appSource).not.toContain("Console" + "App");
  expect(librarySource).not.toContain("render" + "System");
});
