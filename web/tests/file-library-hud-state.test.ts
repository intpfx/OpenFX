import { expect } from "@std/expect";

import {
  buildFileLibraryStorageCloudPoints,
  getFileLibraryStorageCloudPointMotion,
  summarizeFileLibraryHudDevices,
  summarizeFileLibraryHudProgress,
  summarizeFileLibraryStorage,
  summarizeFileLibraryStorageCloud,
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

Deno.test("HUD storage cloud maps the full quota to file colors and neutral free space", () => {
  const gib = 1024 ** 3;
  const cloud = summarizeFileLibraryStorageCloud([
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

  expect(cloud.summary?.usageLabel).toBe("8.0 GB");
  expect(cloud.segments.map((segment) => segment.id)).toEqual([
    "available",
    "image",
    "video",
    "audio",
    "document",
    "other",
  ]);
  expect(cloud.segments.find((segment) => segment.id === "available")).toMatchObject({
    bytes: 12 * gib,
    valueLabel: "12 GB",
    ratio: 0.6,
  });
  expect(cloud.segments.find((segment) => segment.id === "image")?.bytes).toBe(
    3 * gib,
  );
  expect(cloud.segments.reduce((sum, segment) => sum + segment.bytes, 0)).toBe(
    20 * gib,
  );
});

Deno.test("HUD storage cloud deterministically fills its complete pixel field", () => {
  const segments = [
    {
      id: "available" as const,
      label: "可用空间",
      bytes: 16,
      valueLabel: "16 B",
      ratio: 0.5,
    },
    {
      id: "image" as const,
      label: "照片",
      bytes: 8,
      valueLabel: "8 B",
      ratio: 0.25,
    },
    {
      id: "video" as const,
      label: "视频",
      bytes: 8,
      valueLabel: "8 B",
      ratio: 0.25,
    },
  ];
  const points = buildFileLibraryStorageCloudPoints(segments, 8, 4);

  expect(points).toHaveLength(32);
  expect(points.filter((point) => point.kind === "available")).toHaveLength(16);
  expect(points.filter((point) => point.kind === "image")).toHaveLength(8);
  expect(points.filter((point) => point.kind === "video")).toHaveLength(8);
  expect(new Set(points.map((point) => `${point.column}:${point.row}`)).size).toBe(32);
  expect(buildFileLibraryStorageCloudPoints(segments, 8, 4)).toEqual(points);
});

Deno.test("HUD empty storage renders every pixel as available space", () => {
  const cloud = summarizeFileLibraryStorageCloud([], {
    usage: 0,
    quota: 10 * 1024 ** 3,
    persisted: false,
  });
  const points = buildFileLibraryStorageCloudPoints(cloud.segments, 10, 10);

  expect(points).toHaveLength(100);
  expect(new Set(points.map((point) => point.kind))).toEqual(
    new Set(["available"]),
  );
});

Deno.test("HUD storage cloud rounds only by real byte ratio without inventing colored pixels", () => {
  const points = buildFileLibraryStorageCloudPoints(
    [
      {
        id: "available",
        label: "可用空间",
        bytes: 9_999,
        valueLabel: "9.8 KB",
        ratio: 0.9999,
      },
      {
        id: "image",
        label: "照片",
        bytes: 1,
        valueLabel: "1 B",
        ratio: 0.0001,
      },
    ],
    10,
    10,
  );

  expect(points.filter((point) => point.kind === "image")).toHaveLength(0);
  expect(points.filter((point) => point.kind === "available")).toHaveLength(100);
});

Deno.test("HUD storage cloud motion animates geometry without changing storage identity", () => {
  const point = {
    column: 4,
    row: 7,
    kind: "available" as const,
    tone: 0.42,
    scale: 0.8,
  };

  const initial = getFileLibraryStorageCloudPointMotion(point, 0, false);
  const later = getFileLibraryStorageCloudPointMotion(point, 1_200, false);

  expect(later).not.toEqual(initial);
  expect(Math.abs(later.offsetX)).toBeLessThanOrEqual(1);
  expect(Math.abs(later.offsetY)).toBeLessThanOrEqual(2);
  expect(later.alpha).toBeGreaterThanOrEqual(0.78);
  expect(later.alpha).toBeLessThanOrEqual(1);
  expect(getFileLibraryStorageCloudPointMotion(point, 1_200, true)).toEqual({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    alpha: 0.92,
  });
  expect(point.kind).toBe("available");
});

Deno.test("HUD device strata include every private-network member with truthful visibility", () => {
  const devices = summarizeFileLibraryHudDevices([
    { kind: "app", size: 1_000 },
    { kind: "image", size: 100 },
    { kind: "video", size: 50 },
  ], {
    localNodeId: "mac",
    members: [
      { nodeId: "phone", nodeName: "Android 手机" },
      { nodeId: "mac", nodeName: "这台 Mac" },
      { nodeId: "tablet", nodeName: "闲置平板" },
    ],
    connections: [{ nodeId: "phone", status: "connected" }],
    remoteFiles: [
      { nodeId: "phone", size: 20, availability: "online" },
      { nodeId: "tablet", size: 30, availability: "cached" },
    ],
  });

  expect(devices.map((device) => device.nodeId)).toEqual([
    "mac",
    "phone",
    "tablet",
  ]);
  expect(devices[0]).toMatchObject({ status: "local", bytes: 150 });
  expect(devices[1]).toMatchObject({ status: "online", bytes: 20 });
  expect(devices[2]).toMatchObject({ status: "offline", bytes: 30 });
});
