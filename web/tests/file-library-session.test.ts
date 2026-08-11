import { expect } from "@std/expect";

import type { LibraryItem } from "../src/file-library/model.ts";
import {
  createFileLibrarySession,
  type FileLibrarySessionStore,
} from "../src/file-library/file-library-session.ts";

const NOW = "2026-08-11T00:00:00.000Z";

function libraryItem(
  id: string,
  kind: LibraryItem["kind"],
  patch: Partial<LibraryItem> = {},
): LibraryItem {
  return {
    id,
    kind,
    name: `${id}.bin`,
    createdAt: NOW,
    updatedAt: NOW,
    size: 1,
    source: {
      path: `/${id}`,
      name: `${id}.bin`,
      type: "application/octet-stream",
      size: 1,
      lastModified: 0,
    },
    ...patch,
  };
}

function createStore(initial: LibraryItem[]) {
  let items = initial;
  const calls: string[] = [];
  const store: FileLibrarySessionStore = {
    load() {
      calls.push("load");
      return Promise.resolve(items);
    },
    importFiles() {
      calls.push("import");
      return Promise.resolve(items);
    },
    createText() {
      return Promise.resolve(items);
    },
    createLink() {
      return Promise.resolve(items);
    },
    getStoredFile(reference) {
      calls.push(`read:${reference.path}`);
      return Promise.resolve(
        new File(["video"], reference.name, { type: reference.type }),
      );
    },
    storeVideoThumbnail(id, thumbnail) {
      calls.push(`thumbnail:${id}`);
      items = items.map((item) =>
        item.id === id
          ? {
            ...item,
            preview: {
              path: `/${id}/preview`,
              name: "preview.jpg",
              type: thumbnail.blob.type,
              size: thumbnail.blob.size,
              lastModified: 0,
            },
          }
          : item
      );
      return Promise.resolve(items);
    },
    recordPlayback() {
      return Promise.resolve(items);
    },
    processPhoto(id) {
      calls.push(`photo:${id}`);
      items = items.map((item) =>
        item.id === id
          ? {
            ...item,
            processing: { status: "completed", stage: "metadata", attempts: 1 },
          }
          : item
      );
      return Promise.resolve(items);
    },
    processFingerprint(id) {
      calls.push(`fingerprint:${id}`);
      items = items.map((item) =>
        item.id === id
          ? {
            ...item,
            fingerprint: {
              version: 1,
              status: "completed",
              exact: { source: id.repeat(64).slice(0, 64) },
            },
          }
          : item
      );
      return Promise.resolve(items);
    },
    retryFingerprintAnalysis() {
      return Promise.resolve(items);
    },
    removeItem(id) {
      items = items.filter((item) => item.id !== id);
      return Promise.resolve(items);
    },
    estimate() {
      calls.push("estimate");
      return Promise.resolve({ usage: 1, quota: 10, persisted: false });
    },
    persist() {
      return Promise.resolve(true);
    },
  };
  return { store, calls, getItems: () => items };
}

Deno.test("file library session owns loading and background processing", async () => {
  const photo = libraryItem("a", "image", {
    processing: { status: "pending", stage: "metadata", attempts: 0 },
    fingerprint: { version: 1, status: "pending" },
  });
  const video = libraryItem("b", "video", {
    fingerprint: {
      version: 1,
      status: "completed",
      exact: { source: "b".repeat(64) },
    },
  });
  const fake = createStore([photo, video]);
  const session = createFileLibrarySession({
    store: fake.store,
    defaultAppCount: 13,
    createVideoThumbnail: () =>
      Promise.resolve({
        blob: new Blob(["preview"], { type: "image/jpeg" }),
        durationSec: 8,
        selectedTimestampSec: 2,
      }),
  });

  await session.start();
  await session.whenIdle();

  expect(session.getSnapshot().storage).toEqual({
    usage: 1,
    quota: 10,
    persisted: false,
  });
  expect(session.getSnapshot().items.find((item) => item.id === "a")).toMatchObject({
    processing: { status: "completed" },
    fingerprint: { status: "completed" },
  });
  expect(session.getSnapshot().items.find((item) => item.id === "b")?.preview?.path)
    .toBe("/b/preview");
  expect(fake.calls.indexOf("photo:a")).toBeLessThan(
    fake.calls.indexOf("fingerprint:a"),
  );
  session.stop();
});

Deno.test("file library session serializes user mutations through busy state", async () => {
  const fake = createStore([]);
  let releaseImport: (() => void) | undefined;
  let importCalls = 0;
  fake.store.importFiles = async () => {
    importCalls += 1;
    await new Promise<void>((resolve) => {
      releaseImport = resolve;
    });
    return fake.getItems();
  };
  const session = createFileLibrarySession({
    store: fake.store,
    defaultAppCount: 13,
    createVideoThumbnail: () => Promise.reject(new Error("unused")),
  });
  await session.start();

  const first = session.importFiles([new File(["a"], "a.txt")]);
  const second = await session.importFiles([new File(["b"], "b.txt")]);
  expect(session.getSnapshot().busy).toBe(true);
  expect(second).toBe(false);
  expect(importCalls).toBe(1);

  releaseImport?.();
  expect(await first).toBe(true);
  expect(session.getSnapshot().busy).toBe(false);
  expect(session.getSnapshot().message).toBe("已导入 1 个文件");
  session.stop();
});
