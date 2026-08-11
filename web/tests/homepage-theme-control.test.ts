import { expect } from "@std/expect";

import {
  createHomepageThemeControlRuntime,
} from "../src/homepage/HomepageThemeControl.tsx";

type ThemeMediaListener = () => void;

function createMediaQueryList(initialMatches: boolean) {
  const listeners = new Set<ThemeMediaListener>();
  let matches = initialMatches;
  let addCalls = 0;
  let removeCalls = 0;

  return {
    get matches() {
      return matches;
    },
    addEventListener(_event: "change", listener: ThemeMediaListener) {
      addCalls += 1;
      listeners.add(listener);
    },
    removeEventListener(_event: "change", listener: ThemeMediaListener) {
      removeCalls += 1;
      listeners.delete(listener);
    },
    change(nextMatches: boolean) {
      matches = nextMatches;
      for (const listener of listeners) listener();
    },
    get addCalls() {
      return addCalls;
    },
    get removeCalls() {
      return removeCalls;
    },
  };
}

function createThemeDocument() {
  const appliedThemes: string[] = [];
  const dataset = new Proxy<Record<string, string>>({}, {
    set(target, key, value) {
      if (key === "theme") appliedThemes.push(String(value));
      target[String(key)] = String(value);
      return true;
    },
  });
  const meta = { content: "" };

  return {
    document: {
      documentElement: { dataset },
      querySelector: () => meta,
    } as unknown as Document,
    dataset,
    meta,
    appliedThemes,
  };
}

Deno.test("theme controller reads the bootstrap mode and listens only while automatic", () => {
  const media = createMediaQueryList(false);
  const { document } = createThemeDocument();
  const runtime = createHomepageThemeControlRuntime({
    document: () => document,
    media: () => media,
    bootstrapMode: () => "dark",
  });
  const systemDark: boolean[] = [];

  expect(runtime.getInitialMode()).toBe("dark");
  expect(runtime.subscribe("light", (value) => systemDark.push(value))).toBeUndefined();
  expect(media.addCalls).toBe(0);

  const cleanup = runtime.subscribe("auto", (value) => systemDark.push(value));
  expect(media.addCalls).toBe(1);
  media.change(true);
  expect(systemDark).toEqual([true]);
  cleanup?.();
  expect(media.removeCalls).toBe(1);
  media.change(false);
  expect(systemDark).toEqual([true]);
});

Deno.test("theme controller falls back without matchMedia and survives blocked storage lookup", () => {
  const { document, dataset, meta } = createThemeDocument();
  const previousLocalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked getter");
    },
  });

  try {
    const runtime = createHomepageThemeControlRuntime({
      document: () => document,
      media: () => undefined,
    });

    expect(runtime.getSystemDark()).toBe(false);
    expect(runtime.subscribe("auto", () => {})).toBeUndefined();
    expect(runtime.toggle("auto")).toBe("light");
    runtime.sync("light", false);
    expect(dataset.theme).toBe("light");
    expect(meta.content).toBe("#f8f9fb");
  } finally {
    if (previousLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", previousLocalStorage);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  }
});

Deno.test("theme controller continues after storage methods throw", () => {
  const { document } = createThemeDocument();
  const runtime = createHomepageThemeControlRuntime({
    document: () => document,
    storage: () => ({
      setItem: () => {
        throw new Error("blocked set");
      },
      removeItem: () => {
        throw new Error("blocked remove");
      },
    }),
  });

  expect(runtime.toggle("light")).toBe("dark");
  expect(runtime.toggle("dark")).toBe("auto");
});

Deno.test("theme controller applies each effective theme once across state and StrictMode replays", () => {
  const { appliedThemes, document, meta } = createThemeDocument();
  const runtime = createHomepageThemeControlRuntime({
    document: () => document,
  });

  runtime.sync("auto", false);
  runtime.sync("auto", false);
  runtime.sync("dark", false);
  runtime.sync("dark", false);

  expect(appliedThemes).toEqual(["light", "dark"]);
  expect(meta.content).toBe("#171b22");
});
