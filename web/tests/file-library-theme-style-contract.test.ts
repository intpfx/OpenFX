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

Deno.test("homepage controls share one unified HUD", () => {
  expect(homepage).toContain(
    'className="file-library-head file-library-hud is-expanded"',
  );
  expect(homepage).toContain('className="file-library-core"');
  expect(homepage).toContain('className="file-library-analysis"');
  expect(homepage).toContain('className="file-library-actions"');
  expect(homepage).toContain('aria-label="收起文件库控制面板"');
  expect(homepage).toContain("--file-library-core-progress");
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
  expect(cssRule(css, ".homepage-theme-control")).toContain(
    "color 0.18s ease",
  );
  expect(cssRule(libraryCss, ".file-library-card::after")).toContain(
    "border-color 160ms ease",
  );
});
