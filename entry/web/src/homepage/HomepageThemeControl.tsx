/** @jsxRuntime classic */
/** @jsx h */

import { createElement as h, useEffect, useState } from "react";
import { CircleHalf, Moon, Sun } from "@phosphor-icons/react";

import {
  getHomepageThemeModeLabel,
  getHomepageThemeToggleLabel,
  getNextHomepageThemeMode,
  type HomepageEffectiveTheme,
  type HomepageThemeMode,
  type HomepageThemeStorage,
  persistHomepageThemeMode,
  resolveHomepageEffectiveTheme,
} from "./theme.ts";
import "../jsx.ts";

const THEME_COLORS: Record<HomepageEffectiveTheme, string> = {
  light: "#f8f9fb",
  dark: "#171b22",
};

type ThemeMediaQuery = {
  readonly matches: boolean;
  addEventListener: (type: "change", listener: () => void) => void;
  removeEventListener: (type: "change", listener: () => void) => void;
};

type ThemeDocument = Pick<Document, "documentElement" | "querySelector">;

export type HomepageThemeControlRuntime = {
  getInitialMode: () => HomepageThemeMode;
  getSystemDark: () => boolean;
  subscribe: (
    mode: HomepageThemeMode,
    onSystemDarkChange: (systemDark: boolean) => void,
  ) => (() => void) | undefined;
  sync: (mode: HomepageThemeMode, systemDark: boolean) => void;
  toggle: (mode: HomepageThemeMode) => HomepageThemeMode;
};

export type HomepageThemeControlRuntimeOptions = {
  bootstrapMode?: () => HomepageThemeMode | undefined;
  document?: () => ThemeDocument;
  media?: () => ThemeMediaQuery | undefined;
  storage?: () => HomepageThemeStorage | undefined;
};

function getBrowserThemeMedia() {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)");
}

function applyTheme(document: ThemeDocument, theme: HomepageEffectiveTheme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[theme];
}

export function createHomepageThemeControlRuntime(
  options: HomepageThemeControlRuntimeOptions = {},
): HomepageThemeControlRuntime {
  const getBootstrapMode = options.bootstrapMode ??
    (() => globalThis.window?.__OPENFX_THEME_BOOTSTRAP__?.mode);
  const getDocument = options.document ?? (() => document);
  const getMedia = options.media ?? getBrowserThemeMedia;
  const getStorage = options.storage ?? (() => globalThis.localStorage);
  let lastAppliedTheme: HomepageEffectiveTheme | undefined;

  return {
    getInitialMode() {
      return getBootstrapMode() ?? "auto";
    },
    getSystemDark() {
      return getMedia()?.matches ?? false;
    },
    subscribe(mode, onSystemDarkChange) {
      if (mode !== "auto") return;
      const media = getMedia();
      if (!media) return;
      const update = () => onSystemDarkChange(media.matches);
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    },
    sync(mode, systemDark) {
      const theme = resolveHomepageEffectiveTheme(mode, systemDark);
      if (theme === lastAppliedTheme) return;
      applyTheme(getDocument(), theme);
      lastAppliedTheme = theme;
    },
    toggle(mode) {
      const next = getNextHomepageThemeMode(mode);
      try {
        const storage = getStorage();
        if (storage) persistHomepageThemeMode(storage, next);
      } catch {
        // A blocked localStorage getter must not stop a theme transition.
      }
      return next;
    },
  };
}

export function HomepageThemeControlView(props: {
  compact?: boolean;
  mode: HomepageThemeMode;
  onToggle: () => void;
}) {
  const ThemeIcon = props.mode === "dark"
    ? Moon
    : props.mode === "light"
    ? Sun
    : CircleHalf;

  return (
    <button
      aria-label={getHomepageThemeToggleLabel(props.mode)}
      className={`homepage-theme-control${props.compact ? " is-compact" : ""}`}
      type="button"
      onClick={props.onToggle}
    >
      {props.compact
        ? <ThemeIcon aria-hidden="true" size={22} weight="regular" />
        : (
          <span className="homepage-theme-control-copy">
            <span className="footer-eyebrow homepage-theme-control-label">THEME</span>
            <span aria-hidden="true" className="homepage-theme-control-separator">
              ·
            </span>
            <span className="homepage-theme-control-value">
              {getHomepageThemeModeLabel(props.mode)}
            </span>
          </span>
        )}
    </button>
  );
}

export function HomepageThemeControl(props: { compact?: boolean } = {}) {
  const [runtime] = useState(createHomepageThemeControlRuntime);
  const [mode, setMode] = useState<HomepageThemeMode>(
    runtime.getInitialMode,
  );
  const [systemDark, setSystemDark] = useState(runtime.getSystemDark);

  useEffect(() => {
    return runtime.subscribe(mode, setSystemDark);
  }, [mode, runtime]);

  const toggle = () => {
    const next = runtime.toggle(mode);
    setMode(next);
    if (next === "auto") setSystemDark(runtime.getSystemDark());
  };

  useEffect(() => {
    runtime.sync(mode, systemDark);
  }, [mode, runtime, systemDark]);

  return (
    <HomepageThemeControlView
      compact={props.compact}
      mode={mode}
      onToggle={toggle}
    />
  );
}
