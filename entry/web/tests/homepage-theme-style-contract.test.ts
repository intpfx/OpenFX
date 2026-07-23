import { expect } from "@std/expect";

const css = await Deno.readTextFile(
  new URL("../src/styles.css", import.meta.url),
);
const app = await Deno.readTextFile(
  new URL("../src/App.tsx", import.meta.url),
);

function cssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(
    new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]+)\\}`),
  );
  expect(match, `missing CSS rule: ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

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
      "--text-on-accent",
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

Deno.test("owned panel JSX uses semantic text tokens instead of inline color bypasses", () => {
  expect(app).not.toMatch(/color:\s*["']#[0-9a-f]{3,8}["']/i);
  expect(app).not.toContain("var(--muted)");
  expect(app).toContain('className="chinagas-install-link"');
  expect(app).toContain('className="chinagas-install-note"');

  const linkRule = cssRule(".chinagas-install-link");
  const noteRule = cssRule(".chinagas-install-note");
  expect(linkRule).toContain("color: var(--text-on-accent)");
  expect(noteRule).toContain("color: var(--text-secondary)");
});

Deno.test("theme controls browser color scheme and poster treatment", () => {
  expect(css).toContain("color-scheme: light;");
  expect(css).toContain("color-scheme: dark;");
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

Deno.test("theme color transitions are bounded to 180ms", () => {
  const contracts = [
    ["body", "background-color 0.18s ease, color 0.18s ease"],
    [
      ".homepage-location-gate",
      "background-color 0.18s ease, border-color 0.18s ease",
    ],
    [
      ".project-search-input",
      "border-color 0.18s, box-shadow 0.18s, background-color 0.18s, color 0.18s",
    ],
    [".brand-word", "color 0.18s ease"],
    [".message-compose-back", "color 0.18s ease, background-color 0.18s ease"],
    [".homepage-theme-control", "color 0.18s ease"],
    [
      ".map-poster-primary,\n.map-poster-secondary",
      "background-color 0.18s ease",
    ],
  ];

  for (const [selector, transition] of contracts) {
    expect(cssRule(selector)).toContain(transition);
  }
});

Deno.test("reduced motion zeros every theme-transition target", () => {
  const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
  expect(reducedMotionStart).toBeGreaterThanOrEqual(0);
  const reducedMotionCss = css.slice(reducedMotionStart);
  const themeTargets = [
    "body",
    ".homepage-poster-background::before",
    ".homepage-poster-background img",
    ".homepage-location-gate",
    ".brand-word",
    ".project-search-input",
    ".project-card",
    ".pc-links a",
    ".homepage-footer-dock",
    ".message-compose-back",
    ".homepage-theme-control",
    ".ctrl-btn",
    ".admin-primary-action",
    ".admin-danger-action",
    ".admin-project-option",
    ".admin-kv-key-row",
    ".domain-panel",
    ".domain-panel-section",
    ".map-poster-map-controls button",
    ".map-poster-field input",
    ".map-poster-field select",
    ".map-poster-primary",
    ".map-poster-secondary",
    ".map-poster-live-frame",
  ].join(",\n  ");

  expect(reducedMotionCss).toContain(
    `${themeTargets} {\n    transition-duration: 0s !important;`,
  );
});
