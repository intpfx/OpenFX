# OpenFX Editorial Index Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current boxed homepage footer with the approved Editorial Index layout and add flash-free automatic, light, and dark themes controlled from the Dock.

**Architecture:** Keep `HomepageLocationPoster` as the owner of location and poster lifecycle, but change `HomepageFooterDock` to three semantic slots: `meta`, `index`, and `action`. A pure theme model plus a parser-blocking bootstrap script establishes the first effective theme; a thin React control owns later system changes and manual preference writes. CSS theme tokens drive the homepage and OpenFX-owned detail surfaces while the protected Console and third-party frames remain independent.

**Tech Stack:** React 19, TypeScript, VitePlus, CSS custom properties, browser `matchMedia`, `localStorage`, Deno tests, Nitro/Deno Deploy build.

**Design spec:** `docs/superpowers/specs/2026-07-23-openfx-editorial-index-dock-design.md`

## Global Constraints

- The first screen remains a usable 13-card project browser; do not add a Hero, filter, route, API, dependency, WebGL effect, or persistent user-data format beyond the approved `openfx-theme` preference.
- The only theme modes are `auto`, `light`, and `dark`; the visible control cycles `AUTO → LIGHT → DARK → AUTO`.
- Only manual `light` and `dark` preferences use `localStorage` key `openfx-theme`; `auto` removes the key.
- The first effective theme is applied before the React entry and main stylesheet can paint.
- Theme coverage includes the homepage, cards, Editorial Dock, location permission/status surfaces, Map Poster background treatment, and OpenFX-owned detail panels.
- The protected Console, third-party Proxy page, and project iframe internals keep their own theme behavior.
- `HomepageLocationPoster` continues to own geolocation, fetch cancellation, object URLs, OSM attribution, authorization focus, and the live region.
- The authorization capsule remains an independent highest-layer dialog; its surrounding page and Dock stay blurred, `inert`, and `aria-hidden`.
- Desktop `>900px` uses an in-grid two-baseline Dock; `<=900px` uses one fixed two-row Dock above the safe area.
- Every mobile interactive target remains at least 44px high.
- Normal and reduced-motion modes must not replay card entrance animation when theme changes.
- Do not push, merge, deploy, or modify server/domain behavior as part of this plan.

## File Structure

### New files

- `entry/web/public/theme-bootstrap.js` — synchronous pre-React theme selection and immutable bootstrap snapshot.
- `entry/web/src/homepage/theme.ts` — pure theme types, parsing, cycle order, labels, and effective-theme resolution.
- `entry/web/src/homepage/HomepageThemeControl.tsx` — browser I/O controller and presentational theme button.
- `entry/web/src/homepage/BuildVersion.tsx` — compact build metadata renderer for the Editorial meta line.
- `entry/web/tests/homepage-theme.test.ts` — pure theme-model tests.
- `entry/web/tests/homepage-theme-bootstrap.test.ts` — executable bootstrap-script contract tests.
- `entry/web/tests/homepage-theme-control-view.test.tsx` — theme-control markup and accessible-label tests.
- `entry/web/tests/homepage-build-version.test.tsx` — compact build metadata render tests.
- `entry/web/tests/homepage-theme-style-contract.test.ts` — light/dark token and surface coverage contract.

### Modified files

- `entry/web/index.html` — load the synchronous theme bootstrap before the React entry.
- `entry/web/src/App.tsx` — compose `meta`, `index`, and `action` content without owning Dock layout.
- `entry/web/src/homepage/HomepageFooterDock.tsx` — Editorial Index semantic structure.
- `entry/web/src/homepage/HomepageLocationPoster.tsx` — concise `BACKGROUND`, city, OSM, and retry presentation.
- `entry/web/src/styles.css` — Editorial layout, responsive rules, semantic color tokens, dark theme, and poster treatment.
- `entry/web/tests/homepage-footer-dock.test.tsx` — new slot order and one-shell contract.
- `entry/web/tests/homepage-location-poster-view.test.tsx` — new Dock slot helper and concise status copy.
- `entry/web/tests/homepage-location-layout-contract.test.ts` — two-baseline and mobile-layout assertions.
- `entry/web/README.md` — user-facing theme and Editorial Index maintenance contract.
- `entry/web/deno.json` — allow tests to read the bootstrap and HTML entry.
- `deno.json` — mirror the new bounded test read paths in root `test` and `check`.

---

### Task 1: Pure Theme Model and Flash-Free Bootstrap

**Files:**
- Create: `entry/web/src/homepage/theme.ts`
- Create: `entry/web/public/theme-bootstrap.js`
- Create: `entry/web/tests/homepage-theme.test.ts`
- Create: `entry/web/tests/homepage-theme-bootstrap.test.ts`
- Modify: `entry/web/index.html`
- Modify: `entry/web/deno.json`
- Modify: `deno.json`

**Interfaces:**
- Produces:
  - `type HomepageThemeMode = "auto" | "light" | "dark"`
  - `type HomepageEffectiveTheme = "light" | "dark"`
  - `HOMEPAGE_THEME_STORAGE_KEY = "openfx-theme"`
  - `parseHomepageThemeMode(value: unknown): HomepageThemeMode`
  - `getNextHomepageThemeMode(mode: HomepageThemeMode): HomepageThemeMode`
  - `resolveHomepageEffectiveTheme(mode, systemDark): HomepageEffectiveTheme`
  - `persistHomepageThemeMode(storage, mode): void`
  - `getHomepageThemeModeLabel(mode): "AUTO" | "LIGHT" | "DARK"`
  - `getHomepageThemeToggleLabel(mode): string`
  - `window.__OPENFX_THEME_BOOTSTRAP__: Readonly<{ mode; effectiveTheme }>`
- Consumes: browser `localStorage`, `matchMedia`, `<html>`, and `meta[name="theme-color"]`.

- [ ] **Step 1: Write the pure-model failing tests**

Create `entry/web/tests/homepage-theme.test.ts`:

```ts
import { expect } from "@std/expect";
import {
  getHomepageThemeModeLabel,
  getHomepageThemeToggleLabel,
  getNextHomepageThemeMode,
  parseHomepageThemeMode,
  persistHomepageThemeMode,
  resolveHomepageEffectiveTheme,
} from "../src/homepage/theme.ts";

Deno.test("homepage theme accepts only manual persisted modes", () => {
  expect(parseHomepageThemeMode("light")).toBe("light");
  expect(parseHomepageThemeMode("dark")).toBe("dark");
  expect(parseHomepageThemeMode("auto")).toBe("auto");
  expect(parseHomepageThemeMode("sepia")).toBe("auto");
  expect(parseHomepageThemeMode(null)).toBe("auto");
});

Deno.test("homepage theme cycles auto light dark", () => {
  expect(getNextHomepageThemeMode("auto")).toBe("light");
  expect(getNextHomepageThemeMode("light")).toBe("dark");
  expect(getNextHomepageThemeMode("dark")).toBe("auto");
});

Deno.test("homepage effective theme follows the system only in auto", () => {
  expect(resolveHomepageEffectiveTheme("auto", false)).toBe("light");
  expect(resolveHomepageEffectiveTheme("auto", true)).toBe("dark");
  expect(resolveHomepageEffectiveTheme("light", true)).toBe("light");
  expect(resolveHomepageEffectiveTheme("dark", false)).toBe("dark");
});

Deno.test("homepage theme labels describe the current and next mode", () => {
  expect(getHomepageThemeModeLabel("dark")).toBe("DARK");
  expect(getHomepageThemeToggleLabel("auto")).toBe(
    "当前主题：自动；切换为浅色",
  );
});

Deno.test("homepage theme persists only manual modes and tolerates blocked storage", () => {
  const calls: string[] = [];
  const storage = {
    getItem: () => null,
    setItem: (key: string, value: string) => calls.push(`set:${key}:${value}`),
    removeItem: (key: string) => calls.push(`remove:${key}`),
  };
  persistHomepageThemeMode(storage, "dark");
  persistHomepageThemeMode(storage, "auto");
  expect(calls).toEqual([
    "set:openfx-theme:dark",
    "remove:openfx-theme",
  ]);
  expect(() =>
    persistHomepageThemeMode({
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    }, "light")
  ).not.toThrow();
});
```

- [ ] **Step 2: Run the pure-model test and verify RED**

Run:

```bash
deno test --allow-env entry/web/tests/homepage-theme.test.ts
```

Expected: FAIL because `entry/web/src/homepage/theme.ts` does not exist.

- [ ] **Step 3: Implement the pure theme model**

Create `entry/web/src/homepage/theme.ts`:

```ts
export type HomepageThemeMode = "auto" | "light" | "dark";
export type HomepageEffectiveTheme = "light" | "dark";

export const HOMEPAGE_THEME_STORAGE_KEY = "openfx-theme";

export type HomepageThemeStorage = Pick<
  Storage,
  "setItem" | "removeItem"
>;

const MODE_LABELS: Record<HomepageThemeMode, "AUTO" | "LIGHT" | "DARK"> = {
  auto: "AUTO",
  light: "LIGHT",
  dark: "DARK",
};

const MODE_NAMES: Record<HomepageThemeMode, string> = {
  auto: "自动",
  light: "浅色",
  dark: "暗色",
};

export function parseHomepageThemeMode(value: unknown): HomepageThemeMode {
  return value === "light" || value === "dark" ? value : "auto";
}

export function getNextHomepageThemeMode(
  mode: HomepageThemeMode,
): HomepageThemeMode {
  if (mode === "auto") return "light";
  if (mode === "light") return "dark";
  return "auto";
}

export function resolveHomepageEffectiveTheme(
  mode: HomepageThemeMode,
  systemDark: boolean,
): HomepageEffectiveTheme {
  return mode === "auto" ? (systemDark ? "dark" : "light") : mode;
}

export function getHomepageThemeModeLabel(mode: HomepageThemeMode) {
  return MODE_LABELS[mode];
}

export function getHomepageThemeToggleLabel(mode: HomepageThemeMode) {
  const next = getNextHomepageThemeMode(mode);
  return `当前主题：${MODE_NAMES[mode]}；切换为${MODE_NAMES[next]}`;
}

export function persistHomepageThemeMode(
  storage: HomepageThemeStorage,
  mode: HomepageThemeMode,
) {
  try {
    if (mode === "auto") {
      storage.removeItem(HOMEPAGE_THEME_STORAGE_KEY);
    } else {
      storage.setItem(HOMEPAGE_THEME_STORAGE_KEY, mode);
    }
  } catch {
    // The current page still switches when storage is unavailable.
  }
}

declare global {
  interface Window {
    __OPENFX_THEME_BOOTSTRAP__?: Readonly<{
      mode: HomepageThemeMode;
      effectiveTheme: HomepageEffectiveTheme;
    }>;
  }
}
```

- [ ] **Step 4: Run the pure-model test and verify GREEN**

Run:

```bash
deno test --allow-env entry/web/tests/homepage-theme.test.ts
```

Expected: 5 passed, 0 failed.

- [ ] **Step 5: Write the bootstrap failing tests**

Create `entry/web/tests/homepage-theme-bootstrap.test.ts`. Execute the public script with explicit browser stubs so the test proves behavior rather than matching source text:

```ts
import { expect } from "@std/expect";

const source = await Deno.readTextFile(
  new URL("../public/theme-bootstrap.js", import.meta.url),
);
const indexHtml = await Deno.readTextFile(
  new URL("../index.html", import.meta.url),
);

function runBootstrap(options: {
  stored?: string | null;
  systemDark: boolean;
  storageThrows?: boolean;
}) {
  const htmlDataset: Record<string, string> = {};
  const meta = { content: "#f8f9fb" };
  const windowObject: Record<string, unknown> = {};
  const localStorage = {
    getItem() {
      if (options.storageThrows) throw new Error("blocked");
      return options.stored ?? null;
    },
  };
  const documentObject = {
    documentElement: { dataset: htmlDataset },
    querySelector() {
      return meta;
    },
  };
  const matchMedia = () => ({ matches: options.systemDark });
  const execute = new Function(
    "window",
    "document",
    "localStorage",
    "matchMedia",
    source,
  );
  execute(windowObject, documentObject, localStorage, matchMedia);
  return { htmlDataset, meta, windowObject };
}

Deno.test("theme bootstrap applies a manual theme before React", () => {
  const result = runBootstrap({ stored: "dark", systemDark: false });
  expect(result.htmlDataset.theme).toBe("dark");
  expect(result.meta.content).toBe("#171b22");
  expect(result.windowObject.__OPENFX_THEME_BOOTSTRAP__).toEqual({
    mode: "dark",
    effectiveTheme: "dark",
  });
});

Deno.test("theme bootstrap follows the system for missing or blocked storage", () => {
  expect(runBootstrap({ stored: null, systemDark: true }).htmlDataset.theme)
    .toBe("dark");
  expect(
    runBootstrap({ systemDark: false, storageThrows: true }).htmlDataset.theme,
  ).toBe("light");
});

Deno.test("theme bootstrap loads before the React entry", () => {
  expect(indexHtml.indexOf('src="/theme-bootstrap.js"')).toBeGreaterThan(-1);
  expect(indexHtml.indexOf('src="/theme-bootstrap.js"')).toBeLessThan(
    indexHtml.indexOf('src="/src/main.tsx"'),
  );
});
```

- [ ] **Step 6: Run the bootstrap test and verify RED**

Run:

```bash
deno test \
  --allow-read=entry/web/index.html,entry/web/public/theme-bootstrap.js \
  entry/web/tests/homepage-theme-bootstrap.test.ts
```

Expected: FAIL because `theme-bootstrap.js` does not exist.

- [ ] **Step 7: Implement and load the bootstrap**

Create `entry/web/public/theme-bootstrap.js`:

```js
(() => {
  const storageKey = "openfx-theme";
  const lightThemeColor = "#f8f9fb";
  const darkThemeColor = "#171b22";
  let stored = null;

  try {
    stored = localStorage.getItem(storageKey);
  } catch {
    stored = null;
  }

  const mode = stored === "light" || stored === "dark" ? stored : "auto";
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const effectiveTheme = mode === "auto"
    ? (systemDark ? "dark" : "light")
    : mode;

  document.documentElement.dataset.theme = effectiveTheme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = effectiveTheme === "dark"
      ? darkThemeColor
      : lightThemeColor;
  }

  window.__OPENFX_THEME_BOOTSTRAP__ = Object.freeze({
    mode,
    effectiveTheme,
  });
})();
```

Insert this exact parser-blocking script in `entry/web/index.html`, after the existing `theme-color` meta and before icons, manifest, or the React entry:

```html
<meta name="theme-color" content="#f8f9fb" />
<script src="/theme-bootstrap.js"></script>
```

Add `index.html` and `public/theme-bootstrap.js` to the bounded `--allow-read` lists in both `entry/web/deno.json` and the root `deno.json` `test`/`check` tasks.

- [ ] **Step 8: Run Task 1 tests and commit**

Run:

```bash
deno test --allow-env \
  --allow-read=entry/web/index.html,entry/web/public/theme-bootstrap.js \
  entry/web/tests/homepage-theme.test.ts \
  entry/web/tests/homepage-theme-bootstrap.test.ts
git diff --check
```

Expected: 8 passed, 0 failed; diff check has no output.

Commit:

```bash
git add deno.json entry/web/deno.json entry/web/index.html \
  entry/web/public/theme-bootstrap.js \
  entry/web/src/homepage/theme.ts \
  entry/web/tests/homepage-theme.test.ts \
  entry/web/tests/homepage-theme-bootstrap.test.ts
git commit -m "feat(web): bootstrap homepage themes"
```

---

### Task 2: React Theme Controller and Compact Build Metadata

**Files:**
- Create: `entry/web/src/homepage/HomepageThemeControl.tsx`
- Create: `entry/web/src/homepage/BuildVersion.tsx`
- Create: `entry/web/tests/homepage-theme-control-view.test.tsx`
- Create: `entry/web/tests/homepage-build-version.test.tsx`
- Modify: `entry/web/src/App.tsx`

**Interfaces:**
- Consumes: Task 1 theme functions and `window.__OPENFX_THEME_BOOTSTRAP__`.
- Produces:
  - `HomepageThemeControl`
  - `HomepageThemeControlView(props: { mode; onToggle })`
  - `createBuildVersion(env): BuildVersionInfo`
  - `BuildVersion`

- [ ] **Step 1: Write failing render tests**

Create `entry/web/tests/homepage-theme-control-view.test.tsx`:

```tsx
/** @jsxRuntime classic */
/** @jsx h */
import { expect } from "@std/expect";
import { renderToStaticMarkup } from "npm:react-dom@^19.1.0/server";
import { createElement as h } from "react";
import { HomepageThemeControlView } from "../src/homepage/HomepageThemeControl.tsx";

Deno.test("theme control is one accessible typographic button", () => {
  const html = renderToStaticMarkup(
    <HomepageThemeControlView mode="auto" onToggle={() => {}} />,
  );
  expect(html.match(/<button/g)?.length).toBe(1);
  expect(html).toContain('class="homepage-theme-control"');
  expect(html).toContain("THEME");
  expect(html).toContain("AUTO");
  expect(html).toContain("当前主题：自动；切换为浅色");
});
```

Create `entry/web/tests/homepage-build-version.test.tsx`:

```tsx
/** @jsxRuntime classic */
/** @jsx h */
import { expect } from "@std/expect";
import { renderToStaticMarkup } from "npm:react-dom@^19.1.0/server";
import { createElement as h } from "react";
import {
  BuildVersion,
  createBuildVersion,
} from "../src/homepage/BuildVersion.tsx";

Deno.test("build version exposes compact and full metadata", () => {
  const info = createBuildVersion({
    hash: "local00",
    time: "2026-06-30T00:00:00Z",
  });
  expect(info.shortLabel).toBe("local00");
  expect(info.fullLabel).toBe("2026-06-30 00:00 UTC + local00");
  const html = renderToStaticMarkup(<BuildVersion info={info} />);
  expect(html).toContain(">BUILD<");
  expect(html).toContain(">local00<");
  expect(html).toContain("2026-06-30 00:00 UTC + local00");
});
```

- [ ] **Step 2: Run the render tests and verify RED**

Run:

```bash
deno test --allow-env \
  entry/web/tests/homepage-theme-control-view.test.tsx \
  entry/web/tests/homepage-build-version.test.tsx
```

Expected: FAIL because both component modules are missing.

- [ ] **Step 3: Implement the build metadata module**

Move the build formatting logic from `App.tsx` into `entry/web/src/homepage/BuildVersion.tsx`. Use this public shape:

```tsx
export type BuildVersionInfo = {
  shortLabel: string;
  fullLabel: string;
  dateTime?: string;
};

export function createBuildVersion(env: {
  hash?: string;
  time?: string;
}): BuildVersionInfo {
  const hash = env.hash?.trim();
  const time = env.time?.trim();
  if (!hash || !time) {
    return { shortLabel: "local", fullLabel: "local build" };
  }
  const date = new Date(time);
  if (Number.isNaN(date.valueOf())) {
    return { shortLabel: hash, fullLabel: `${time} + ${hash}` };
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  const fullLabel = `${date.getUTCFullYear()}-${
    pad(date.getUTCMonth() + 1)
  }-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${
    pad(date.getUTCMinutes())
  } UTC + ${hash}`;
  return { shortLabel: hash, fullLabel, dateTime: date.toISOString() };
}

export function BuildVersion(props: { info: BuildVersionInfo }) {
  return (
    <p className="build-version" title={props.info.fullLabel}>
      <span className="footer-eyebrow">BUILD</span>
      <span className="build-version-value">{props.info.shortLabel}</span>
    </p>
  );
}
```

`App.tsx` creates the build constant with the existing Vite environment values and renders `<BuildVersion info={BUILD_VERSION} />`. Delete the old local build types and functions.

- [ ] **Step 4: Implement the theme control**

Create `entry/web/src/homepage/HomepageThemeControl.tsx` with a presentational view and thin controller:

```tsx
import { useEffect, useState } from "react";
import {
  getHomepageThemeModeLabel,
  getHomepageThemeToggleLabel,
  getNextHomepageThemeMode,
  persistHomepageThemeMode,
  type HomepageEffectiveTheme,
  type HomepageThemeMode,
  resolveHomepageEffectiveTheme,
} from "./theme.ts";

const THEME_COLORS: Record<HomepageEffectiveTheme, string> = {
  light: "#f8f9fb",
  dark: "#171b22",
};

function getSystemDark() {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyTheme(theme: HomepageEffectiveTheme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[theme];
}

export function HomepageThemeControlView(props: {
  mode: HomepageThemeMode;
  onToggle: () => void;
}) {
  return (
    <button
      aria-label={getHomepageThemeToggleLabel(props.mode)}
      className="homepage-theme-control"
      type="button"
      onClick={props.onToggle}
    >
      <span className="footer-eyebrow homepage-theme-control-label">THEME</span>
      <span aria-hidden="true" className="homepage-theme-control-separator">·</span>
      <span className="homepage-theme-control-value">
        {getHomepageThemeModeLabel(props.mode)}
      </span>
    </button>
  );
}

export function HomepageThemeControl() {
  const [mode, setMode] = useState<HomepageThemeMode>(
    () => globalThis.window?.__OPENFX_THEME_BOOTSTRAP__?.mode ?? "auto",
  );
  const [systemDark, setSystemDark] = useState(getSystemDark);

  useEffect(() => {
    if (mode !== "auto") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      setSystemDark(media.matches);
      applyTheme(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [mode]);

  const toggle = () => {
    const next = getNextHomepageThemeMode(mode);
    persistHomepageThemeMode(localStorage, next);
    setMode(next);
    applyTheme(resolveHomepageEffectiveTheme(next, getSystemDark()));
    if (next === "auto") setSystemDark(getSystemDark());
  };

  useEffect(() => {
    applyTheme(resolveHomepageEffectiveTheme(mode, systemDark));
  }, [mode, systemDark]);

  return <HomepageThemeControlView mode={mode} onToggle={toggle} />;
}
```

- [ ] **Step 5: Run Task 2 tests and web type/build checks**

Run:

```bash
deno test --allow-env \
  entry/web/tests/homepage-theme.test.ts \
  entry/web/tests/homepage-theme-control-view.test.tsx \
  entry/web/tests/homepage-build-version.test.tsx
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z \
VITE_OPENFX_BUILD_HASH=local00 \
  deno task --config entry/web/deno.json build
```

Expected: all targeted tests pass and the client/Nitro build exits 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add entry/web/src/App.tsx \
  entry/web/src/homepage/BuildVersion.tsx \
  entry/web/src/homepage/HomepageThemeControl.tsx \
  entry/web/tests/homepage-build-version.test.tsx \
  entry/web/tests/homepage-theme-control-view.test.tsx
git commit -m "feat(web): add homepage theme control"
```

---

### Task 3: Editorial Dock Structure and State Composition

**Files:**
- Modify: `entry/web/src/homepage/HomepageFooterDock.tsx`
- Modify: `entry/web/src/homepage/HomepageLocationPoster.tsx`
- Modify: `entry/web/src/App.tsx`
- Modify: `entry/web/tests/homepage-footer-dock.test.tsx`
- Modify: `entry/web/tests/homepage-location-poster-view.test.tsx`

**Interfaces:**
- Consumes: `BuildVersion`, `HomepageThemeControl`, and location `renderStatus`.
- Produces:
  - `HomepageFooterDock(props: { meta; index; action; inert?; ariaHidden? })`
  - one `<footer>` with `__meta`, `__index`, and `__action` in DOM order.

- [ ] **Step 1: Change the footer render tests first**

Update `entry/web/tests/homepage-footer-dock.test.tsx` to require the new structure:

```tsx
const html = renderToStaticMarkup(
  <HomepageFooterDock
    meta={<span data-test-meta>BUILD · AUTO · 绵阳市</span>}
    index={<input aria-label="搜索项目" />}
    action={<button type="button">MESSAGE</button>}
  />,
);

expect(html.match(/<footer/g)?.length).toBe(1);
expect(html).toContain('class="homepage-footer-dock__meta"');
expect(html).toContain('class="homepage-footer-dock__index"');
expect(html).toContain('class="homepage-footer-dock__action"');
expect(html.indexOf("data-test-meta")).toBeLessThan(
  html.indexOf('aria-label="搜索项目"'),
);
expect(html.indexOf('aria-label="搜索项目"')).toBeLessThan(
  html.indexOf(">MESSAGE</button>"),
);
expect(html).not.toContain("homepage-footer-dock__left");
expect(html).not.toContain("homepage-footer-dock__middle");
expect(html).not.toContain("homepage-footer-dock__right");
```

Change the `inDock` helper in `homepage-location-poster-view.test.tsx` to:

```tsx
const inDock = (status: ReactNode) => (
  <HomepageFooterDock meta={status} index={null} action={null} />
);
```

Update the ready-state assertions to require `BACKGROUND`, the city, `© OSM`, and the retry `aria-label`, and to reject visible `Map Poster` copy.

- [ ] **Step 2: Run the two render test files and verify RED**

Run:

```bash
deno test --allow-env \
  entry/web/tests/homepage-footer-dock.test.tsx \
  entry/web/tests/homepage-location-poster-view.test.tsx
```

Expected: FAIL because the component still exposes `left`, `middle`, and `right`.

- [ ] **Step 3: Implement the new Dock shell**

Replace `HomepageFooterDock.tsx` with:

```tsx
/** @jsxRuntime classic */
/** @jsx h */
import { createElement as h, type ReactNode } from "react";

type HomepageFooterDockProps = {
  meta: ReactNode;
  index: ReactNode;
  action: ReactNode;
  inert?: boolean;
  ariaHidden?: boolean;
};

export function HomepageFooterDock(props: HomepageFooterDockProps) {
  return (
    <footer
      aria-hidden={props.ariaHidden ? true : undefined}
      aria-label="首页控制栏"
      className="homepage-footer-dock"
      inert={props.inert ? true : undefined}
    >
      <div className="homepage-footer-dock__meta">{props.meta}</div>
      <div className="homepage-footer-dock__index">{props.index}</div>
      <div className="homepage-footer-dock__action">{props.action}</div>
    </footer>
  );
}
```

- [ ] **Step 4: Make location status concise**

In `HomepageLocationPoster.tsx`, keep all controller behavior but change only normal Dock presentation:

```tsx
<section aria-label="城市背景状态" className="homepage-location-status">
  <span className="footer-eyebrow homepage-location-label">BACKGROUND</span>
  <strong>{props.place?.city ?? "已按当前位置生成"}</strong>
  <a
    aria-label="© OpenStreetMap contributors"
    className="homepage-location-attribution"
    href="https://www.openstreetmap.org/copyright"
    rel="noreferrer"
    target="_blank"
  >
    © OSM
  </a>
  <button aria-label="重新定位" title="重新定位" type="button" onClick={props.onRetry}>
    <span aria-hidden="true">↻</span>
  </button>
</section>
```

Rendering, denied, unavailable, and error states use the same `BACKGROUND` eyebrow plus one short `<strong>` status. Do not change permission-gate copy, suspended poster attribution, or live-region placement.

- [ ] **Step 5: Split App footer composition by responsibility**

Replace the current `left`/`middle`/`right` render block in `App.tsx`:

- `meta`: status hint, `<BuildVersion>`, `<HomepageThemeControl>`, and `locationStatus`.
- `index`: default count/search, message back/`MSG`/input, detail empty state, or Proxy back/input form.
- `action`: the existing primary control, with `form="proxyFooterForm"` and `type="submit"` only in Proxy mode.

Use this structural outline:

```tsx
<HomepageFooterDock
  ariaHidden={locationFocusActive}
  inert={locationFocusActive ? true : undefined}
  meta={
    <>
      <span className="control-hint" aria-live="polite" ref={statusHintRef} />
      <BuildVersion info={BUILD_VERSION} />
      <HomepageThemeControl />
      {locationStatus}
    </>
  }
  index={renderHomepageFooterIndex()}
  action={
    <button
      className={`ctrl-btn${!isPanelOpen ? " primary" : ""}`}
      form={activePanel === "relay-proxy-gateway" ? "proxyFooterForm" : undefined}
      id="homepagePrimaryControl"
      ref={primaryControlRef}
      type={activePanel === "relay-proxy-gateway" ? "submit" : "button"}
      onClick={activePanel === "relay-proxy-gateway" ? undefined : handlePrimaryControl}
    >
      <span className="ctrl-btn-label" ref={primaryControlLabelRef} />
      {isPanelOpen && activePanel !== "relay-proxy-gateway"
        ? <span className="ctrl-btn-back-text">← 返回项目卡片</span>
        : null}
      {activePanel === "relay-proxy-gateway" ? "OPEN" : null}
    </button>
  }
/>
```

`renderHomepageFooterIndex()` is a local render helper inside `Homepage`. It returns the existing controls without changing state ownership. The Proxy form has `id="proxyFooterForm"` and contains only the back button plus URL input. The message input form remains in the index slot; `SEND` continues to call `handleSendMessage` from the primary button.

Replace the single combined `projectCountLabel` string with explicit typographic
parts in the default index state:

```tsx
<span aria-atomic="true" aria-live="polite" className="project-count">
  <strong>{String(filteredProjectCount).padStart(2, "0")}</strong>
  <span>/ {String(totalBrowsableProjectCount).padStart(2, "0")}</span>
</span>
<input
  aria-label="搜索项目"
  className="project-search-input project-command-search"
  placeholder="Search the OpenFX index…"
  type="search"
  value={projectQuery}
  onChange={(event) => setProjectQuery(event.target.value)}
/>
```

- [ ] **Step 6: Run render, web, and build verification**

Run:

```bash
deno test --allow-env \
  entry/web/tests/homepage-footer-dock.test.tsx \
  entry/web/tests/homepage-location-poster-view.test.tsx \
  entry/web/tests/homepage-theme-control-view.test.tsx \
  entry/web/tests/homepage-build-version.test.tsx
deno task --config entry/web/deno.json test
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z \
VITE_OPENFX_BUILD_HASH=local00 \
  deno task --config entry/web/deno.json build
```

Expected: all targeted and web tests pass; deterministic build exits 0.

- [ ] **Step 7: Commit Task 3**

```bash
git add entry/web/src/App.tsx \
  entry/web/src/homepage/HomepageFooterDock.tsx \
  entry/web/src/homepage/HomepageLocationPoster.tsx \
  entry/web/tests/homepage-footer-dock.test.tsx \
  entry/web/tests/homepage-location-poster-view.test.tsx
git commit -m "refactor(web): compose editorial homepage dock"
```

---

### Task 4: Editorial Typography and Responsive Layout

**Files:**
- Modify: `entry/web/src/styles.css`
- Modify: `entry/web/tests/homepage-location-layout-contract.test.ts`
- Modify: `entry/web/tests/homepage-footer-dock.test.tsx`

**Interfaces:**
- Consumes: Task 3 `__meta`, `__index`, and `__action` structure.
- Produces: desktop two-baseline layout and mobile fixed two-row layout.

- [ ] **Step 1: Replace the CSS contract with Editorial requirements**

Update `homepage-location-layout-contract.test.ts` so the desktop test requires:

```ts
const dock = cssRule(".homepage-footer-dock");
expect(dock).toContain("grid-template-columns: minmax(0, 1fr) auto");
expect(dock).toContain("grid-template-rows:");
expect(dock).toContain("border-bottom:");
expect(dock).toContain("background: transparent");
expect(dock).not.toContain("border: 1px solid");
expect(dock).not.toContain("border-radius:");
expect(dock).not.toContain("backdrop-filter:");
expect(dock).not.toContain("box-shadow:");

expect(cssRule(".homepage-footer-dock__meta")).toContain("grid-row: 1");
expect(cssRule(".homepage-footer-dock__index")).toContain("grid-row: 2");
expect(cssRule(".homepage-footer-dock__action")).toContain("grid-row: 1 / 3");
```

The mobile test must require one fixed shell, the same two rows, a theme value, and 44px controls. Retain assertions that normal location status is not fixed and that `:has()` is absent.

- [ ] **Step 2: Run the layout contract and verify RED**

Run:

```bash
deno test --allow-env --allow-read=entry/web/src/styles.css \
  entry/web/tests/homepage-location-layout-contract.test.ts
```

Expected: FAIL against the current boxed three-column Dock CSS.

- [ ] **Step 3: Implement the desktop Editorial layout**

Replace the current `.homepage-footer-dock` and slot rules in `styles.css` with:

```css
.homepage-footer-dock {
  grid-column: 1 / -1;
  grid-row: 3;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: minmax(20px, auto) minmax(32px, auto);
  min-width: 0;
  min-height: 56px;
  align-items: stretch;
  border-bottom: 1px solid var(--border);
  background: transparent;
}

.homepage-footer-dock__meta {
  display: flex;
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  align-items: center;
  gap: 0.9rem;
  overflow: hidden;
}

.homepage-footer-dock__index {
  display: flex;
  grid-column: 1;
  grid-row: 2;
  min-width: 0;
  align-items: stretch;
}

.homepage-footer-dock__action {
  display: flex;
  grid-column: 2;
  grid-row: 1 / 3;
  min-width: 8.5rem;
  align-items: stretch;
  border-left: 1px solid var(--border);
}

.footer-eyebrow {
  color: var(--text-secondary);
  font: 650 0.5rem/1 ui-monospace, "SFMono-Regular", Menlo, monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
```

Restyle the build, theme, location, count, search, message, Proxy, and primary controls to use typography and whitespace rather than nested boxes. The current count remains the blue `0.82rem` focal value; `/ 13` uses a separate muted span or CSS pseudo-safe markup. The search has no full border and gains only an inset blue bottom line on focus.

- [ ] **Step 4: Implement the mobile layout**

Inside `@media (max-width: 900px)`, keep one fixed Dock and use:

```css
.homepage-footer-dock {
  position: fixed;
  right: 1rem;
  bottom: max(0.72rem, env(safe-area-inset-bottom));
  left: 1rem;
  z-index: 30;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: 44px 44px;
  min-height: 88px;
  border: 0;
  border-block: 1px solid var(--border);
  border-radius: 8px;
  background: var(--dock-mobile-background);
  padding-inline: 0.55rem 0;
}

.homepage-footer-dock__meta {
  gap: 0.45rem;
}

.homepage-footer-dock__action {
  min-width: 5.8rem;
}

.homepage-theme-control-label,
.homepage-theme-control-separator,
.build-version .footer-eyebrow,
.homepage-location-label {
  display: none;
}
```

At 390px preserve the theme value, city, current count, search, and action. Cap OSM text width and keep its full `aria-label`. Every button, input, and attribution link retains `min-height: 44px`.

- [ ] **Step 5: Run layout and render tests**

Run:

```bash
deno test --allow-env --allow-read=entry/web/src/styles.css \
  entry/web/tests/homepage-location-layout-contract.test.ts \
  entry/web/tests/homepage-footer-dock.test.tsx \
  entry/web/tests/homepage-location-poster-view.test.tsx
git diff --check
```

Expected: all tests pass; diff check has no output.

- [ ] **Step 6: Commit Task 4**

```bash
git add entry/web/src/styles.css \
  entry/web/tests/homepage-footer-dock.test.tsx \
  entry/web/tests/homepage-location-layout-contract.test.ts
git commit -m "feat(web): style editorial homepage dock"
```

---

### Task 5: Semantic Light/Dark Color System

**Files:**
- Modify: `entry/web/src/styles.css`
- Create: `entry/web/tests/homepage-theme-style-contract.test.ts`

**Interfaces:**
- Consumes: `<html data-theme="light|dark">` from Tasks 1–2.
- Produces: complete homepage/OpenFX panel semantic tokens and dark Map Poster treatment.

- [ ] **Step 1: Write the style contract before CSS changes**

Create `entry/web/tests/homepage-theme-style-contract.test.ts`:

```ts
import { expect } from "@std/expect";

const css = await Deno.readTextFile(
  new URL("../src/styles.css", import.meta.url),
);

Deno.test("homepage declares complete light and dark semantic tokens", () => {
  expect(css).toContain(':root,\n:root[data-theme="light"]');
  expect(css).toContain(':root[data-theme="dark"]');
  for (
    const token of [
      "--bg",
      "--surface",
      "--surface-raised",
      "--text-primary",
      "--text-secondary",
      "--accent",
      "--border",
      "--grid-line",
      "--dock-mobile-background",
      "--shadow-color",
      "--poster-overlay-start",
      "--poster-overlay-end",
    ]
  ) {
    expect(css.match(new RegExp(`${token}:`, "g"))?.length).toBeGreaterThanOrEqual(2);
  }
});

Deno.test("theme controls browser color scheme and poster treatment", () => {
  expect(css).toContain('color-scheme: light;');
  expect(css).toContain('color-scheme: dark;');
  expect(css).toContain(':root[data-theme="dark"] .homepage-poster-background img');
  expect(css).not.toContain("body {\n  color-scheme: light;");
});

Deno.test("owned surfaces use semantic theme values", () => {
  for (
    const selector of [
      ".project-card",
      ".domain-panel",
      ".homepage-location-gate",
      ".homepage-footer-dock",
    ]
  ) {
    expect(css).toContain(selector);
  }
  expect(css).toContain("background: var(--surface");
  expect(css).toContain("background: var(--dock-mobile-background)");
});
```

- [ ] **Step 2: Run the style contract and verify RED**

Run:

```bash
deno test --allow-read=entry/web/src/styles.css \
  entry/web/tests/homepage-theme-style-contract.test.ts
```

Expected: FAIL because the CSS has only a light `:root` and fixed `color-scheme: light`.

- [ ] **Step 3: Define the two token sets**

Replace the top-level token block with:

```css
:root,
:root[data-theme="light"] {
  color-scheme: light;
  --bg: oklch(0.985 0.002 250);
  --surface: oklch(0.97 0.003 250);
  --surface-raised: oklch(0.995 0.002 250);
  --text-primary: oklch(0.15 0.002 260);
  --text-secondary: oklch(0.45 0.005 260);
  --accent: oklch(0.55 0.2 250);
  --accent-glow: oklch(0.65 0.15 250);
  --border: oklch(0.88 0.005 260);
  --grid-line: oklch(0.88 0.005 260 / 0.3);
  --dock-mobile-background: oklch(0.985 0.004 250 / 0.94);
  --shadow-color: oklch(0.25 0.035 250 / 0.1);
  --poster-overlay-start: oklch(0.985 0.002 250 / 0.14);
  --poster-overlay-end: oklch(0.985 0.002 250);
  --radius: 2px;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: oklch(0.19 0.012 250);
  --surface: oklch(0.23 0.014 250);
  --surface-raised: oklch(0.27 0.014 250);
  --text-primary: oklch(0.91 0.006 250);
  --text-secondary: oklch(0.68 0.012 250);
  --accent: oklch(0.72 0.16 250);
  --accent-glow: oklch(0.77 0.13 250);
  --border: oklch(0.36 0.015 250);
  --grid-line: oklch(0.36 0.015 250 / 0.34);
  --dock-mobile-background: oklch(0.2 0.014 250 / 0.94);
  --shadow-color: oklch(0.05 0.01 250 / 0.36);
  --poster-overlay-start: oklch(0.19 0.012 250 / 0.4);
  --poster-overlay-end: oklch(0.19 0.012 250);
  --radius: 2px;
}
```

Change the body grid to use `var(--grid-line)` and remove the fixed `color-scheme: light` from `body`.

- [ ] **Step 4: Convert owned surfaces to semantic tokens**

In `styles.css`, replace light-only backgrounds and shadows for these owned selector groups:

- homepage brand, project cards, preview source/runtime layers, tags, and links;
- `.domain-panel` and all OpenFX-owned panel sections/forms;
- Editorial Dock, search/message/Proxy controls, and focus states;
- `.homepage-location-gate`, status controls, and OSM attribution pills;
- Map Poster panel fields, preview frame, theme strip, and download controls.

Use `var(--surface)`, `var(--surface-raised)`, `var(--bg)`, `var(--border)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--accent)`, and `var(--shadow-color)`. Do not alter `entry/web/src/console/console.css` or style iframe contents.

- [ ] **Step 5: Add dark Map Poster background treatment and theme transitions**

Use theme variables in the existing poster overlay gradient:

```css
.homepage-poster-background::before {
  background: linear-gradient(
    to bottom,
    var(--poster-overlay-start) 0%,
    color-mix(in oklch, var(--poster-overlay-start) 70%, var(--bg)) 68%,
    color-mix(in oklch, var(--bg) 78%, transparent) 84%,
    var(--poster-overlay-end) 100%
  );
}

:root[data-theme="dark"] .homepage-poster-background img {
  filter: brightness(0.43) contrast(1.34) saturate(0.48);
  mix-blend-mode: screen;
  opacity: 0.52;
}
```

Apply a maximum 180ms color transition only to page, owned surfaces, borders, text, and the poster overlay. In the existing reduced-motion media query, set these transition durations to `0s`. Do not add transforms or opacity changes to cards during theme switches.

- [ ] **Step 6: Run theme CSS, web, and build verification**

Run:

```bash
deno test --allow-env --allow-read=entry/web/src/styles.css \
  entry/web/tests/homepage-theme-style-contract.test.ts \
  entry/web/tests/homepage-location-layout-contract.test.ts
deno task --config entry/web/deno.json test
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z \
VITE_OPENFX_BUILD_HASH=local00 \
  deno task --config entry/web/deno.json build
git diff --check
```

Expected: targeted and web suites pass; build exits 0; diff check has no output.

- [ ] **Step 7: Commit Task 5**

```bash
git add entry/web/src/styles.css \
  entry/web/tests/homepage-theme-style-contract.test.ts
git commit -m "feat(web): add light and dark homepage themes"
```

---

### Task 6: Documentation, Browser Acceptance, and Final Gates

**Files:**
- Modify: `entry/web/README.md`
- Modify only if browser acceptance exposes a defect: files already listed in Tasks 1–5 and their tests.

**Interfaces:**
- Consumes: complete Editorial Dock and theme feature.
- Produces: maintainer documentation and final acceptance evidence.

- [ ] **Step 1: Update the Web README**

Add an “Editorial Index 与主题” subsection to `entry/web/README.md` that records:

```markdown
- Dock 使用 `meta`、`index`、`action` 三个插槽；桌面为两条文字基线，移动端为同一固定外壳内两行。
- 主题模式为 `auto`、`light`、`dark`；单一文字按钮按 AUTO → LIGHT → DARK → AUTO 循环。
- 仅手动模式写入 `localStorage["openfx-theme"]`；AUTO 删除该键并实时跟随系统。
- `theme-bootstrap.js` 必须在 React 入口前设置 `<html data-theme>` 和浏览器 `theme-color`，避免暗色首屏闪白。
- 主题覆盖 OpenFX 首页与自有详情面板，不覆盖 Console 或第三方 iframe。
- 定位授权胶囊、inert/live-region 边界、唯一 OSM 归属和真实设备定位流程不得因主题或 Dock 改造而改变。
```

- [ ] **Step 2: Run the complete automated gate on final HEAD**

Run:

```bash
deno task --config entry/web/deno.json test
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z \
VITE_OPENFX_BUILD_HASH=local00 \
  deno task --config entry/web/deno.json build
deno task check
git diff --check
```

Expected: all Web/root/desktop tests pass with only the existing KV integration ignore; client and Nitro Deno Deploy builds exit 0; diff check has no output.

- [ ] **Step 3: Start the local production preview**

Run:

```bash
deno run -A entry/web/.output/server/index.ts
```

Expected: the server listens on `http://localhost:8000/`.

- [ ] **Step 4: Verify light Editorial Index in the browser**

Use the Codex in-app browser first; if unavailable, follow the repository fallback and use Safari. At 1440×900 and 1024×768 verify:

- one transparent two-baseline Dock with no outer capsule, shadow, or three equal boxes;
- `BUILD`, theme, `BACKGROUND`, city, OSM, retry, count, search, and `MESSAGE` follow the approved hierarchy;
- search `map` reports `02 / 13`;
- Tab order reaches theme, OSM, retry, search, and `MESSAGE` visibly;
- MESSAGE, detail return, and Proxy states keep the same Dock height and outer shell.

- [ ] **Step 5: Verify mobile Editorial Index**

At 900×844 and 390×844 verify:

- one fixed two-row Dock above the safe area;
- current theme value, city, count, search, and action remain visible;
- every button/input/link is at least 44px high;
- there is no horizontal scroll, overlap, or height jump in default, message, and detail states.

- [ ] **Step 6: Verify all theme behaviors**

In browser emulation and actual storage:

1. Clear `openfx-theme`; emulate light system and reload: `AUTO`, light page, no flash.
2. Keep key absent; emulate dark system: page changes live to dark and still displays `AUTO`.
3. Click once: `LIGHT`, storage value `light`, page stays light despite dark-system emulation.
4. Click again: `DARK`, storage value `dark`, page is dark.
5. Reload: dark renders before React without a visible light frame.
6. Click again: `AUTO`, storage key is absent, page resumes system behavior.
7. Verify light and dark cards, detail panel, Dock, location gate, OSM link, Map Poster panel, and city poster background.
8. Confirm Console remains its existing dark surface and no iframe is CSS-inverted.
9. Enable reduced motion and switch themes: colors change without Dock movement, card entrance replay, or prolonged transitions.

- [ ] **Step 7: Commit documentation and any acceptance-only fixes**

If browser acceptance required a code fix, first add a failing focused test, apply the smallest fix, and rerun Steps 2, 4, 5, and 6.

Commit:

```bash
git add entry/web/README.md
git commit -m "docs(web): document editorial dock themes"
```

- [ ] **Step 8: Final branch review package**

Generate a review package from the implementation base to final HEAD and request an independent whole-branch review. The review must report Critical, Important, and Minor findings and explicitly verify:

- the Editorial structure and typographic hierarchy;
- all default/message/detail/Proxy states;
- first-paint and live system-theme behavior;
- storage failure fallback and preference persistence;
- dark Map Poster and permission-gate accessibility;
- no server/domain/dependency/deployment scope expansion.

Fix every Critical or Important finding in one bounded wave, add regression tests, rerun the full gate, and request re-review before declaring completion.
