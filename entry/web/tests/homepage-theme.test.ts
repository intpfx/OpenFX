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
    persistHomepageThemeMode(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
      "light",
    )
  ).not.toThrow();
});
