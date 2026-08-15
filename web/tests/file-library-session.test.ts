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
    processAudio(id) {
      calls.push(`audio:${id}`);
      items = items.map((item) =>
        item.id === id
          ? {
            ...item,
            preview: {
              path: `/${id}/cover`,
              name: "cover.jpg",
              type: "image/jpeg",
              size: 4,
              lastModified: 0,
            },
            audio: { title: "Song", artist: "Artist", album: "Album" },
            audioProcessing: { status: "completed", attempts: 1 },
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
    retryFingerprintAnalysis(id) {
      calls.push(`retry-fingerprint:${id}`);
      items = items.map((item) =>
        item.id === id
          ? {
            ...item,
            fingerprint: { version: 1, status: "pending" },
          }
          : item
      );
      return Promise.resolve(items);
    },
    setFavorite(id, favorite) {
      calls.push(`favorite:${id}:${favorite}`);
      items = items.map((item) => item.id === id ? { ...item, favorite } : item);
      return Promise.resolve(items);
    },
    updateItemDetails(id, patch) {
      calls.push(`update:${id}:${patch.name ?? ""}`);
      items = items.map((item) =>
        item.id === id
          ? {
            ...item,
            name: patch.name ?? item.name,
            source: patch.name ? { ...item.source, name: patch.name } : item.source,
            albums: patch.albums ?? item.albums,
          }
          : item
      );
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
  return {
    store,
    calls,
    getItems: () => items,
    setItems: (next: LibraryItem[]) => {
      items = next;
    },
  };
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
  const audio = libraryItem("c", "audio", {
    audioProcessing: { status: "pending", attempts: 0 },
    fingerprint: {
      version: 1,
      status: "completed",
      exact: { source: "c".repeat(64) },
    },
  });
  const fake = createStore([photo, video, audio]);
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
  expect(session.getSnapshot().items.find((item) => item.id === "a"))
    .toMatchObject({
      processing: { status: "completed" },
      fingerprint: { status: "completed" },
    });
  expect(
    session.getSnapshot().items.find((item) => item.id === "b")?.preview?.path,
  )
    .toBe("/b/preview");
  expect(session.getSnapshot().items.find((item) => item.id === "c"))
    .toMatchObject({
      audio: { title: "Song", artist: "Artist", album: "Album" },
      audioProcessing: { status: "completed" },
      preview: { path: "/c/cover" },
    });
  expect(fake.calls).toContain("audio:c");
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

Deno.test("file library session imports one native Photos selection through the existing store", async () => {
  const fake = createStore([]);
  const imported: string[][] = [];
  fake.store.importFiles = (files) => {
    imported.push(files.map((file) => file.name));
    return Promise.resolve(fake.getItems());
  };
  const session = createFileLibrarySession({
    store: fake.store,
    defaultAppCount: 13,
    createVideoThumbnail: () => Promise.reject(new Error("unused")),
    nativePhotoImporter: {
      isAvailable: () => Promise.resolve(true),
      pick: () =>
        Promise.resolve([
          new File(["still"], "IMG_7732.HEIC", { type: "image/heic" }),
          new File(["motion"], "IMG_7732.mov", { type: "video/quicktime" }),
        ]),
    },
  });

  await session.start();
  expect(session.getSnapshot().nativePhotosAvailable).toBe(true);
  expect(await session.importFromPhotos()).toBe(true);
  expect(imported).toEqual([["IMG_7732.HEIC", "IMG_7732.mov"]]);
  expect(session.getSnapshot().message).toBe("已从 Photos 导入 1 张实况照片");
  session.stop();
});

Deno.test("file library session can reopen Photos immediately after cancellation", async () => {
  const fake = createStore([]);
  let pickCalls = 0;
  const session = createFileLibrarySession({
    store: fake.store,
    defaultAppCount: 13,
    createVideoThumbnail: () => Promise.reject(new Error("unused")),
    nativePhotoImporter: {
      isAvailable: () => Promise.resolve(true),
      pick: () => {
        pickCalls += 1;
        return Promise.resolve(null);
      },
    },
  });

  await session.start();
  expect(await session.importFromPhotos()).toBe(false);
  expect(session.getSnapshot().busy).toBe(false);
  expect(session.getSnapshot().message).toBe("已取消选择");
  expect(await session.importFromPhotos()).toBe(false);
  expect(pickCalls).toBe(2);
  expect(session.getSnapshot().busy).toBe(false);
  session.stop();
});

Deno.test("file library session owns favorite mutations for every item kind", async () => {
  const fake = createStore([libraryItem("app", "app")]);
  const session = createFileLibrarySession({
    store: fake.store,
    defaultAppCount: 13,
    createVideoThumbnail: () => Promise.reject(new Error("unused")),
  });
  await session.start();

  expect(await session.setFavorite("app", true)).toBe(true);
  expect(session.getSnapshot().items[0]?.favorite).toBe(true);
  expect(session.getSnapshot().message).toBe("已收藏");
  expect(fake.calls).toContain("favorite:app:true");
  session.stop();
});

Deno.test("file library session owns file detail updates", async () => {
  const fake = createStore([libraryItem("photo", "image")]);
  const session = createFileLibrarySession({
    store: fake.store,
    defaultAppCount: 13,
    createVideoThumbnail: () => Promise.reject(new Error("unused")),
  });
  await session.start();

  expect(
    await session.updateItemDetails("photo", {
      name: "tokyo-poster.png",
      albums: ["东京", "海报"],
    }),
  ).toBe(true);
  expect(session.getSnapshot().items[0]).toMatchObject({
    name: "tokyo-poster.png",
    source: { name: "tokyo-poster.png" },
    albums: ["东京", "海报"],
  });
  expect(session.getSnapshot().message).toBe("已更新文件信息");
  expect(fake.calls).toContain("update:photo:tokyo-poster.png");
  session.stop();
});

Deno.test("file library session retries failed fingerprints once per start", async () => {
  const failed = libraryItem("failed", "file", {
    fingerprint: {
      version: 1,
      status: "failed",
      error: "worker unavailable",
    },
  });
  const fake = createStore([failed]);
  fake.store.processFingerprint = (id) => {
    fake.calls.push(`fingerprint:${id}`);
    const items = fake.getItems().map((item) =>
      item.id === id
        ? {
          ...item,
          fingerprint: {
            version: 1 as const,
            status: "failed" as const,
            error: "worker unavailable",
          },
        }
        : item
    );
    fake.setItems(items);
    return Promise.resolve(items);
  };
  const session = createFileLibrarySession({
    store: fake.store,
    defaultAppCount: 13,
    createVideoThumbnail: () => Promise.reject(new Error("unused")),
  });

  await session.start();
  await session.whenIdle();
  session.resumeBackgroundWork();
  await session.whenIdle();

  expect(fake.calls.filter((call) => call === "retry-fingerprint:failed"))
    .toHaveLength(
      1,
    );
  expect(fake.calls.filter((call) => call === "fingerprint:failed"))
    .toHaveLength(1);

  session.stop();
  await session.start();
  await session.whenIdle();

  expect(fake.calls.filter((call) => call === "retry-fingerprint:failed"))
    .toHaveLength(
      2,
    );
  expect(fake.calls.filter((call) => call === "fingerprint:failed"))
    .toHaveLength(2);
  session.stop();
});
