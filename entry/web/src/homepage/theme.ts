export type HomepageThemeMode = "auto" | "light" | "dark";
export type HomepageEffectiveTheme = "light" | "dark";

export const HOMEPAGE_THEME_STORAGE_KEY = "openfx-theme";

export type HomepageThemeStorage = Pick<Storage, "setItem" | "removeItem">;

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

export function persistHomepageThemeMode<StorageLike extends HomepageThemeStorage>(
  storage: StorageLike,
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
