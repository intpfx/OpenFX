import { expect } from "@std/expect";

const source = await Deno.readTextFile(
  new URL("../public/theme-bootstrap.js", import.meta.url),
);
const indexHtml = await Deno.readTextFile(
  new URL("../index.html", import.meta.url),
);

function runBootstrap(systemDark: boolean) {
  const htmlDataset: Record<string, string> = {};
  const meta = { content: "#f8f9fb" };
  const listeners = new Set<() => void>();
  let matches = systemDark;
  const media = {
    get matches() {
      return matches;
    },
    addEventListener(type: "change", listener: () => void) {
      if (type === "change") listeners.add(listener);
    },
  };
  const documentObject = {
    documentElement: { dataset: htmlDataset },
    querySelector() {
      return meta;
    },
  };
  const matchMedia = () => media;
  const execute = new Function(
    "document",
    "matchMedia",
    source,
  );
  execute(documentObject, matchMedia);
  return {
    htmlDataset,
    meta,
    setSystemDark(next: boolean) {
      matches = next;
      for (const listener of listeners) listener();
    },
  };
}

Deno.test("theme bootstrap applies the current system theme before React", () => {
  const dark = runBootstrap(true);
  expect(dark.htmlDataset.theme).toBe("dark");
  expect(dark.meta.content).toBe("#171b22");

  const light = runBootstrap(false);
  expect(light.htmlDataset.theme).toBe("light");
  expect(light.meta.content).toBe("#f8f9fb");
});

Deno.test("theme bootstrap keeps following system changes without manual storage", () => {
  const result = runBootstrap(false);
  result.setSystemDark(true);
  expect(result.htmlDataset.theme).toBe("dark");
  expect(result.meta.content).toBe("#171b22");

  expect(source).not.toContain("localStorage");
  expect(source).not.toContain("openfx-theme");
});

Deno.test("theme bootstrap loads before the React entry", () => {
  expect(indexHtml.indexOf('src="/theme-bootstrap.js"')).toBeGreaterThan(-1);
  expect(indexHtml.indexOf('src="/theme-bootstrap.js"')).toBeLessThan(
    indexHtml.indexOf('src="/src/main.tsx"'),
  );
});
