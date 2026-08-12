(() => {
  const lightThemeColor = "#f8f9fb";
  const darkThemeColor = "#171b22";
  const systemTheme = matchMedia("(prefers-color-scheme: dark)");

  const applySystemTheme = () => {
    const effectiveTheme = systemTheme.matches ? "dark" : "light";
    document.documentElement.dataset.theme = effectiveTheme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.content = effectiveTheme === "dark" ? darkThemeColor : lightThemeColor;
    }
  };

  applySystemTheme();
  systemTheme.addEventListener("change", applySystemTheme);
})();
