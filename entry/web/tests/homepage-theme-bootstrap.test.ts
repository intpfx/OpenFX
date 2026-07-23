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
