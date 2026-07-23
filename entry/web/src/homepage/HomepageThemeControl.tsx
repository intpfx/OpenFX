/** @jsxRuntime classic */
/** @jsx h */

import { createElement as h, useEffect, useState } from "react";

import {
  getHomepageThemeModeLabel,
  getHomepageThemeToggleLabel,
  getNextHomepageThemeMode,
  type HomepageEffectiveTheme,
  type HomepageThemeMode,
  persistHomepageThemeMode,
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
