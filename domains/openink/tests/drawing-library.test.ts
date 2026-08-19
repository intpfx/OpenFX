import { expect } from "@std/expect";

import { createDrawingDocument } from "../src/drawing-document.ts";
import {
  activateDrawingDocument,
  bootstrapDrawingLibrary,
  loadDrawingLibrary,
  persistDrawingDocument,
  type TextStore,
} from "../src/drawing-library.ts";

type MemoryStore =
  & TextStore
  & Readonly<{
    files: Map<string, string>;
    failNextWrite(path: string): void;
  }>;

function createMemoryStore(): MemoryStore {
  const files = new Map<string, string>();
  let failingPath: string | null = null;
  return {
    files,
    failNextWrite(path) {
      failingPath = path;
    },
    readText(path) {
      return Promise.resolve(files.get(path) ?? null);
    },
    writeText(path, contents) {
      if (path === failingPath) {
        failingPath = null;
        return Promise.reject(new Error("simulated write failure"));
      }
      files.set(path, contents);
      return Promise.resolve();
    },
  };
}

Deno.test("an empty library boots into a durable active drawing", async () => {
  const store = createMemoryStore();
  const fresh = createDrawingDocument({
    id: "doc-1",
    title: "第一张画稿",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });

  const bootstrapped = await bootstrapDrawingLibrary(store, {
    legacyDocument: null,
    createFresh: () => fresh,
  });
  const reloaded = await loadDrawingLibrary(store);

  expect(bootstrapped.snapshot.activeDocumentId).toBe(fresh.id);
  expect(bootstrapped.migratedLegacy).toBe(false);
  expect(reloaded?.items.map((item) => item.document)).toEqual([fresh]);
  expect([...store.files.keys()].sort()).toEqual([
    "catalog-a.json",
    "documents/doc-1/revision-1.json",
  ]);
});

Deno.test("a legacy single drawing migrates only after its OPFS catalog is durable", async () => {
  const store = createMemoryStore();
  const legacy = createDrawingDocument({
    id: "legacy-doc",
    title: "迁入的旧画稿",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });

  const migrated = await bootstrapDrawingLibrary(store, {
    legacyDocument: legacy,
    createFresh: () => {
      throw new Error("已有旧画稿时不应创建空白画稿");
    },
  });
  const reloaded = await loadDrawingLibrary(store);

  expect(migrated.migratedLegacy).toBe(true);
  expect(reloaded?.items[0].document).toEqual(legacy);
  expect(store.files.has("catalog-a.json")).toBe(true);
});

Deno.test("a compatibility drawing joins an existing OPFS library before cleanup", async () => {
  const store = createMemoryStore();
  const existing = createDrawingDocument({
    id: "opfs-doc",
    title: "库内画稿",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  await bootstrapDrawingLibrary(store, {
    legacyDocument: null,
    createFresh: () => existing,
  });
  const compatibility = createDrawingDocument({
    id: "compatibility-doc",
    title: "兼容存储画稿",
    now: "2026-08-19T00:05:00.000Z",
    width: 1200,
    height: 800,
  });

  const recovered = await bootstrapDrawingLibrary(store, {
    legacyDocument: compatibility,
    createFresh: () => {
      throw new Error("已有画稿时不应创建空白画稿");
    },
  });

  expect(recovered.migratedLegacy).toBe(true);
  expect(recovered.snapshot.activeDocumentId).toBe(compatibility.id);
  expect(recovered.snapshot.items.map((item) => item.document.title)).toEqual([
    "库内画稿",
    "兼容存储画稿",
  ]);
});

Deno.test("a failed catalog commit leaves the previous drawing generation readable", async () => {
  const store = createMemoryStore();
  const original = createDrawingDocument({
    id: "doc-1",
    title: "保存前",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const { snapshot } = await bootstrapDrawingLibrary(store, {
    legacyDocument: null,
    createFresh: () => original,
  });
  const changed = {
    ...original,
    title: "不应半保存",
    updatedAt: "2026-08-19T00:01:00.000Z",
  };
  store.failNextWrite("catalog-b.json");

  let failure: unknown;
  try {
    await persistDrawingDocument(store, snapshot, changed);
  } catch (error) {
    failure = error;
  }
  const reloaded = await loadDrawingLibrary(store);

  expect(failure).toBeInstanceOf(Error);
  expect(reloaded?.items[0].document.title).toBe("保存前");
  expect(store.files.has("documents/doc-1/revision-2.json")).toBe(true);
});

Deno.test("activating an existing drawing advances only the catalog", async () => {
  const store = createMemoryStore();
  const first = createDrawingDocument({
    id: "doc-1",
    now: "2026-08-19T00:00:00.000Z",
    width: 1200,
    height: 800,
  });
  const second = createDrawingDocument({
    id: "doc-2",
    now: "2026-08-19T00:01:00.000Z",
    width: 1200,
    height: 800,
  });
  const bootstrapped = await bootstrapDrawingLibrary(store, {
    legacyDocument: null,
    createFresh: () => first,
  });
  const withSecond = await persistDrawingDocument(
    store,
    bootstrapped.snapshot,
    second,
  );

  const activated = await activateDrawingDocument(store, withSecond, first.id);
  const reloaded = await loadDrawingLibrary(store);

  expect(activated.activeDocumentId).toBe(first.id);
  expect(activated.generation).toBe(3);
  expect(reloaded?.activeDocumentId).toBe(first.id);
  expect([...store.files.keys()].filter((path) => path.includes("revision"))).toEqual([
    "documents/doc-1/revision-1.json",
    "documents/doc-2/revision-1.json",
  ]);
});
