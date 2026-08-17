import { expect } from "@std/expect";

import {
  parsePrivateMeshCatalogRecord,
  replacePrivateMeshCatalogSnapshot,
  retainPrivateMeshCatalogMembers,
} from "../src/file-library/private-mesh-catalog.ts";

const NOW = "2026-08-15T01:00:00.000Z";

Deno.test("private mesh catalog normalizes persisted metadata without retaining paths", () => {
  const record = parsePrivateMeshCatalogRecord({
    version: 1,
    meshId: "mesh-family",
    snapshots: [{
      nodeId: "node-ipad",
      receivedAt: NOW,
      entries: [{
        itemId: "photo-1",
        name: "海边.heic",
        kind: "image",
        type: "image/heic",
        size: 2048,
        updatedAt: NOW,
        thumbnail: { version: 1, revision: "8192:1723683600000" },
        path: "/private/originals/photo-1",
        latitude: 31.2,
      }],
    }],
  });

  expect(record).toEqual({
    version: 1,
    meshId: "mesh-family",
    snapshots: [{
      nodeId: "node-ipad",
      receivedAt: NOW,
      entries: [{
        itemId: "photo-1",
        name: "海边.heic",
        kind: "image",
        type: "image/heic",
        size: 2048,
        updatedAt: NOW,
        thumbnail: { version: 1, revision: "8192:1723683600000" },
      }],
    }],
  });
});

Deno.test("private mesh catalog replaces a device snapshot and drops revoked members", () => {
  const first = replacePrivateMeshCatalogSnapshot(null, {
    meshId: "mesh-family",
    nodeId: "node-ipad",
    receivedAt: NOW,
    entries: [{
      itemId: "old",
      name: "旧文件.txt",
      kind: "text",
      type: "text/plain",
      size: 3,
      updatedAt: NOW,
    }],
  });
  const second = replacePrivateMeshCatalogSnapshot(first, {
    meshId: "mesh-family",
    nodeId: "node-mac",
    receivedAt: NOW,
    entries: [],
  });
  const refreshed = replacePrivateMeshCatalogSnapshot(second, {
    meshId: "mesh-family",
    nodeId: "node-ipad",
    receivedAt: "2026-08-15T02:00:00.000Z",
    entries: [],
  });

  expect(refreshed.snapshots).toEqual([
    {
      nodeId: "node-mac",
      receivedAt: NOW,
      entries: [],
    },
    {
      nodeId: "node-ipad",
      receivedAt: "2026-08-15T02:00:00.000Z",
      entries: [],
    },
  ]);
  expect(
    retainPrivateMeshCatalogMembers(refreshed, "mesh-family", ["node-ipad"]),
  ).toEqual({
    version: 1,
    meshId: "mesh-family",
    snapshots: [{
      nodeId: "node-ipad",
      receivedAt: "2026-08-15T02:00:00.000Z",
      entries: [],
    }],
  });
});
