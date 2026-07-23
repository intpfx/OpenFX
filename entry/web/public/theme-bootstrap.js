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
