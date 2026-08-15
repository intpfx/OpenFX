import { expect } from "@std/expect";

import {
  summarizeFileLibraryHudProgress,
  summarizeFileLibraryStorage,
  summarizeFileLibraryStorageHeatmap,
  toggleFileLibraryEntrySelection,
} from "../src/file-library/hud-state.ts";
import { createPendingFileFingerprint } from "../src/file-library/similarity-core.ts";

Deno.test("HUD similarity progress ignores virtual Apps and reports active work", () => {
  const progress = summarizeFileLibraryHudProgress([
    { kind: "app" },
    {
      kind: "image",
      fingerprint: {
        version: 1,
        status: "completed",
        exact: { source: "a".repeat(64) },
      },
    },
    { kind: "video", fingerprint: createPendingFileFingerprint() },
  ]);

  expect(progress).toEqual({
    total: 2,
    processed: 1,
    failed: 0,
    active: true,
    ratio: 0.5,
    label: "相似整理中",
  });
});

Deno.test("HUD similarity progress exposes completed, failed and empty states", () => {
  expect(summarizeFileLibraryHudProgress([]).label).toBe("等待导入");

  const completed = summarizeFileLibraryHudProgress([
    {
      kind: "text",
      fingerprint: {
        version: 1,
        status: "unsupported",
      },
    },
  ]);
  expect(completed.label).toBe("整理完成");
  expect(completed.ratio).toBe(1);

  const failed = summarizeFileLibraryHudProgress([
    {
      kind: "video",
      fingerprint: {
        version: 1,
        status: "failed",
        error: "decode failed",
      },
    },
  ]);
  expect(failed.label).toBe("部分失败");
  expect(failed.processed).toBe(1);
});

Deno.test("HUD group selection toggles by entry while retaining a member anchor", () => {
  const entries = [
    { id: "group:one", items: [{ id: "alpha" }, { id: "beta" }] },
    { id: "item:gamma", items: [{ id: "gamma" }] },
  ];

  expect(toggleFileLibraryEntrySelection(null, entries[0], entries)).toBe("alpha");
  expect(toggleFileLibraryEntrySelection("beta", entries[0], entries)).toBeNull();
  expect(toggleFileLibraryEntrySelection("alpha", entries[1], entries)).toBe(
    "gamma",
  );
  expect(toggleFileLibraryEntrySelection("gamma", entries[1], entries)).toBeNull();
});

Deno.test("HUD storage summary reports used, available and quota space", () => {
  expect(summarizeFileLibraryStorage(null)).toBeNull();
  expect(summarizeFileLibraryStorage({
    usage: 1.5 * 1024 ** 3,
    quota: 10 * 1024 ** 3,
    persisted: true,
  })).toEqual({
    usageLabel: "1.5 GB",
    quotaLabel: "10 GB",
    availableLabel: "8.5 GB",
    ratio: 0.15,
    percent: 15,
    persisted: true,
  });
});

Deno.test("HUD storage summary clamps invalid and over-quota estimates", () => {
  expect(summarizeFileLibraryStorage({
    usage: 12 * 1024 ** 3,
    quota: 10 * 1024 ** 3,
    persisted: false,
  })).toMatchObject({
    availableLabel: "0 B",
    ratio: 1,
    percent: 100,
  });
  expect(summarizeFileLibraryStorage({
    usage: Number.NaN,
    quota: -1,
    persisted: false,
  })).toMatchObject({
    usageLabel: "0 B",
    quotaLabel: "0 B",
    availableLabel: "0 B",
    ratio: 0,
    percent: 0,
  });
});

Deno.test("HUD storage heatmap fills quota with available space and file categories", () => {
  const gib = 1024 ** 3;
  const heatmap = summarizeFileLibraryStorageHeatmap([
    { kind: "app", size: 5 * gib },
    { kind: "video", size: 4 * gib },
    { kind: "image", size: 2 * gib },
    { kind: "live-photo", size: 1 * gib },
    { kind: "pdf", size: 0.5 * gib },
    { kind: "audio", size: 0.25 * gib },
    { kind: "file", size: 0.25 * gib },
  ], {
    usage: 8 * gib,
    quota: 20 * gib,
    persisted: false,
  });

  expect(heatmap.summary?.usageLabel).toBe("8.0 GB");
  expect(heatmap.tiles.map((tile) => tile.id)).toEqual([
    "available",
    "video",
    "image",
    "live-photo",
    "document",
    "audio",
    "other",
  ]);
  expect(heatmap.tiles.find((tile) => tile.id === "available")).toMatchObject({
    label: "可用空间",
    valueLabel: "12 GB",
    bytes: 12 * gib,
  });
  expect(heatmap.tiles.find((tile) => tile.id === "document")?.bytes).toBe(
    0.5 * gib,
  );
  expect(heatmap.tiles.reduce(
    (area, tile) => area + tile.rect.width * tile.rect.height,
    0,
  )).toBeCloseTo(10_000, 5);
  const available = heatmap.tiles.find((tile) => tile.id === "available");
  expect((available?.rect.width ?? 0) * (available?.rect.height ?? 0) / 10_000)
    .toBeCloseTo(0.6, 5);
});

Deno.test("HUD storage heatmap assigns browser overhead to other storage", () => {
  const mib = 1024 ** 2;
  const heatmap = summarizeFileLibraryStorageHeatmap([
    { kind: "image", size: 2 * mib },
  ], {
    usage: 5 * mib,
    quota: 10 * mib,
    persisted: true,
  });

  expect(heatmap.tiles.find((tile) => tile.id === "image")?.bytes).toBe(2 * mib);
  expect(heatmap.tiles.find((tile) => tile.id === "other")?.bytes).toBe(3 * mib);
  expect(heatmap.tiles.find((tile) => tile.id === "available")?.bytes).toBe(
    5 * mib,
  );
});

Deno.test("HUD storage heatmap keeps extreme storage shares visible", () => {
  const mib = 1024 ** 2;
  const heatmap = summarizeFileLibraryStorageHeatmap([
    { kind: "video", size: mib },
  ], {
    usage: mib,
    quota: 10 * 1024 ** 3,
    persisted: false,
  });

  const available = heatmap.tiles.find((tile) => tile.id === "available");
  const video = heatmap.tiles.find((tile) => tile.id === "video");
  expect(available?.valueLabel).toBe("10.0 GB");
  expect(available?.rect.width).toBeCloseTo(68, 5);
  expect(video?.rect.width).toBeCloseTo(32, 5);
});
