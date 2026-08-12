import { expect } from "@std/expect";

const css = await Deno.readTextFile(
  new URL("../src/styles.css", import.meta.url),
);
const libraryCss = await Deno.readTextFile(
  new URL("../src/file-library/file-library.css", import.meta.url),
);
const app = await Deno.readTextFile(
  new URL("../src/App.tsx", import.meta.url),
);
const homepage = await Deno.readTextFile(
  new URL("../src/file-library/FileLibraryHomepage.tsx", import.meta.url),
);
const manifest = JSON.parse(
  await Deno.readTextFile(new URL("../public/site.webmanifest", import.meta.url)),
);
const serviceWorker = await Deno.readTextFile(
  new URL("../public/sw.js", import.meta.url),
);

function cssRule(source: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]+)\\}`),
  );
  expect(match, `missing CSS rule: ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

Deno.test("file library declares complete light and dark semantic tokens", () => {
  expect(css).toContain(':root,\n:root[data-theme="light"]');
  expect(css).toContain(':root[data-theme="dark"]');
  expect(libraryCss).toContain('html[data-theme="light"]');

  for (
    const token of [
      "--surface",
      "--surface-raised",
      "--text-primary",
      "--text-secondary",
      "--accent",
      "--border",
    ]
  ) {
    expect(css.match(new RegExp(`${token}:`, "g"))?.length).toBeGreaterThanOrEqual(2);
  }
});

Deno.test("migrated App panels use semantic text tokens", () => {
  expect(app).not.toMatch(/color:\s*["']#[0-9a-f]{3,8}["']/i);
  expect(app).toContain('className="chinagas-install-link"');
  expect(app).toContain('className="chinagas-install-note"');

  expect(cssRule(css, ".chinagas-install-link")).toContain(
    "color: var(--text-on-accent)",
  );
  expect(cssRule(css, ".chinagas-install-note")).toContain(
    "color: var(--text-secondary)",
  );
});

Deno.test("file-library and App viewer surfaces retain semantic theming", () => {
  expect(libraryCss).toContain(".file-library-card");
  expect(libraryCss).toContain(".file-library-hud");
  expect(libraryCss).toContain(".file-library-viewer.is-app");
  expect(css).toContain(".domain-panel");
  expect(css).toContain("background: var(--surface");
});

Deno.test("homepage uses a full-bleed selected-item HUD and borderless control strip", () => {
  expect(homepage).toContain(
    'className="file-library-hud-preview"',
  );
  expect(homepage).toContain('className="file-library-searchbar"');
  expect(homepage).toContain('aria-label="文件库操作"');
  expect(homepage).toContain('aria-label="导入文件"');
  expect(homepage).toContain('aria-label="保存链接"');
  expect(homepage).toContain('aria-label="新建文本"');
  expect(homepage).toContain('className="file-library-toolbar-actions"');
  expect(homepage).toContain('className="file-library-hud-preview-app-copy"');
  expect(homepage).toContain("props.item.app?.description");
  expect(homepage).toContain("placeholder={`搜索 ${visibleItems.length} 项`}");
  expect(homepage).not.toContain('className="file-library-selection"');
  expect(homepage).not.toContain('className="file-library-count"');
  expect(homepage).not.toContain("HomepageThemeControl");
  expect(homepage).not.toContain("SMART_VIEW_LABELS");
  expect(homepage).not.toContain("file-library-actions-popover");
  expect(homepage).not.toContain('aria-label="更多文件库操作"');
  expect(homepage).not.toContain('aria-label="文件库筛选"');
  expect(homepage).not.toContain("file-library-hud-preview-bar");
  expect(homepage).not.toContain("file-library-collapse");
  expect(homepage).not.toContain("hudExpanded");
  expect(homepage).toContain("--file-library-grid-columns");
  expect(homepage).toContain("resolveLibraryGridColumnsFromPinch");
  expect(homepage).not.toContain('className="file-library-brand"');
  expect(libraryCss).toContain(
    "grid-template-columns: repeat(var(--file-library-grid-columns)",
  );
  expect(libraryCss).toContain(
    "grid-auto-rows: calc(100vw / var(--file-library-grid-columns))",
  );
  expect(libraryCss).toContain("border-radius: 18px 18px 0 0");
  expect(libraryCss).toContain("gap: 0");
  expect(libraryCss).toContain("padding: 0");
  expect(cssRule(libraryCss, ".file-library-hud-preview")).toContain(
    "height: clamp(300px, 50svh, 560px)",
  );
  expect(cssRule(libraryCss, ".file-library-hud-preview-app-copy")).toContain(
    "width: min(760px, calc(100% - 48px))",
  );
  const operationHover = cssRule(
    libraryCss,
    ".file-library-toolbar-actions > button:hover,\n.file-library-toolbar-actions > button:focus-visible",
  );
  expect(operationHover).toContain("background: transparent");
  expect(operationHover).toContain("box-shadow: none");
  expect(operationHover).toContain("color: #9ebddd");
});

Deno.test("portrait mobile pins a forty-percent HUD above the scrolling grid", () => {
  const portraitRule = "@media (max-width: 900px) and (orientation: portrait)";
  expect(libraryCss).toContain(portraitRule);
  expect(libraryCss.lastIndexOf(portraitRule)).toBeGreaterThan(
    libraryCss.lastIndexOf("height: min(58svh, 540px)"),
  );
  expect(libraryCss.slice(libraryCss.lastIndexOf(portraitRule))).toContain(
    "position: fixed",
  );
  expect(libraryCss).toContain("height: 40svh");
  expect(libraryCss).toContain("inset: calc(40svh + 60px) 0 0");
  expect(libraryCss).toContain("overflow-y: auto");
  expect(libraryCss).toContain("overscroll-behavior: contain");
  expect(libraryCss).not.toContain("margin-top: calc(40svh + 60px)");
  expect(libraryCss).not.toContain(".file-library-head.is-collapsed");
});

Deno.test("landscape and wide desktop share a split HUD and scrolling matrix", () => {
  const wideRule = "@media (orientation: landscape), (min-width: 1100px)";
  const wideLayout = libraryCss.slice(libraryCss.lastIndexOf(wideRule));

  expect(libraryCss).toContain(wideRule);
  expect(wideLayout).toContain(
    "--file-library-hud-width: clamp(360px, 42vw, 640px)",
  );
  expect(wideLayout).toContain(
    "grid-template-columns: var(--file-library-hud-width) minmax(0, 1fr)",
  );
  expect(wideLayout).toContain(
    "grid-template-rows: minmax(0, 1fr) var(--file-library-toolbar-height)",
  );
  expect(wideLayout).toContain("--file-library-toolbar-height: 56px");
  expect(wideLayout).toContain("border-radius: 18px 0 0 18px");
  expect(wideLayout).toContain("grid-auto-rows: min-content");
  expect(wideLayout).not.toContain("grid-auto-rows: auto");
  expect(wideLayout).toContain("overflow-y: auto");
  expect(wideLayout).toContain("object-fit: contain");
});

Deno.test("video playback progress cannot replace the active player iframe", () => {
  expect(homepage).toContain("const [mediaPlayerSource] = useState(() =>");
  expect(homepage).toContain("src={mediaPlayerSource}");
  expect(homepage).toContain("key={selected.id}");
  expect(homepage).not.toContain("src={makeMediaPlayerUrl(playerRef");
});

Deno.test("installed OpenFX receives system-opened and shared files for OPFS import", () => {
  expect(manifest.file_handlers?.[0]?.action).toBe("/?source=file-handler");
  expect(manifest.share_target?.action).toBe("/share-target");
  expect(serviceWorker).toContain('form.getAll("files")');
  expect(homepage).toContain("connectFileLibrarySessionToBrowser");
});

Deno.test("theme color transitions remain bounded", () => {
  expect(cssRule(css, "body")).toContain(
    "background-color 0.18s ease, color 0.18s ease",
  );
  expect(cssRule(css, ".domain-panel")).toContain(
    "background-color 0.18s ease",
  );
  expect(cssRule(libraryCss, ".file-library-card::after")).toContain(
    "border-color 160ms ease",
  );
});
