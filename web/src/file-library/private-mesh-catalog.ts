import type { LibraryItemKind } from "./model.ts";

const PRIVATE_MESH_CATALOG_VERSION = 1 as const;
const MAX_CATALOG_SNAPSHOTS = 64;
const MAX_CATALOG_ENTRIES_PER_SNAPSHOT = 10_000;
const MAX_CATALOG_ENTRIES_TOTAL = 50_000;
const MAX_THUMBNAIL_BYTES = 128 * 1024;
const REMOTE_FILE_KINDS = new Set<PrivateMeshCatalogEntry["kind"]>([
  "image",
  "live-photo",
  "video",
  "audio",
  "pdf",
  "text",
  "link",
  "file",
]);

export type PrivateMeshCatalogEntry = Readonly<{
  itemId: string;
  name: string;
  kind: Exclude<LibraryItemKind, "app">;
  type: string;
  size: number;
  updatedAt: string;
  thumbnail?: PrivateMeshThumbnailDescriptor;
}>;

export type PrivateMeshThumbnailDescriptor = Readonly<{
  version: 1;
  revision: string;
}>;

export type PrivateMeshCatalogSnapshot = Readonly<{
  nodeId: string;
  receivedAt: string;
  entries: readonly PrivateMeshCatalogEntry[];
}>;

export type PrivateMeshCatalogRecord = Readonly<{
  version: typeof PRIVATE_MESH_CATALOG_VERSION;
  meshId: string;
  snapshots: readonly PrivateMeshCatalogSnapshot[];
}>;

type CatalogSnapshotInput = Readonly<{
  meshId: string;
  nodeId: string;
  receivedAt: string;
  entries: readonly PrivateMeshCatalogEntry[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedBoundedText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumLength) {
    return null;
  }
  return value;
}

function normalizedIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function parseThumbnailDescriptor(
  value: unknown,
): PrivateMeshThumbnailDescriptor | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("私有网络缩略图描述无效");
  }
  const revision = normalizedBoundedText(value.revision, 200);
  if (!revision || !/^[A-Za-z0-9:_-]+$/u.test(revision)) {
    throw new Error("私有网络缩略图描述无效");
  }
  return { version: 1, revision };
}

export function parsePrivateMeshCatalogEntry(
  value: unknown,
): PrivateMeshCatalogEntry {
  if (!isRecord(value)) throw new Error("私有网络目录条目无效");
  const itemId = normalizedBoundedText(value.itemId, 200);
  const name = normalizedBoundedText(value.name, 255);
  const type = typeof value.type === "string" && value.type.length <= 200
    ? value.type
    : null;
  const updatedAt = normalizedIsoDate(value.updatedAt);
  const thumbnail = parseThumbnailDescriptor(value.thumbnail);
  if (
    !itemId || !name || type === null || !updatedAt ||
    typeof value.kind !== "string" ||
    !REMOTE_FILE_KINDS.has(value.kind as PrivateMeshCatalogEntry["kind"]) ||
    typeof value.size !== "number" || !Number.isSafeInteger(value.size) ||
    value.size < 0
  ) throw new Error("私有网络目录条目无效");
  return {
    itemId,
    name,
    kind: value.kind as PrivateMeshCatalogEntry["kind"],
    type,
    size: value.size,
    updatedAt,
    ...(thumbnail ? { thumbnail } : {}),
  };
}

export function parsePrivateMeshCatalogRecord(
  value: unknown,
): PrivateMeshCatalogRecord {
  if (
    !isRecord(value) || value.version !== PRIVATE_MESH_CATALOG_VERSION ||
    !Array.isArray(value.snapshots) ||
    value.snapshots.length > MAX_CATALOG_SNAPSHOTS
  ) throw new Error("私有网络目录缓存格式无效");
  const meshId = normalizedBoundedText(value.meshId, 200);
  if (!meshId) throw new Error("私有网络目录缓存格式无效");
  let totalEntries = 0;
  const nodeIds = new Set<string>();
  const snapshots = value.snapshots.map((snapshot) => {
    if (!isRecord(snapshot) || !Array.isArray(snapshot.entries)) {
      throw new Error("私有网络目录缓存格式无效");
    }
    const nodeId = normalizedBoundedText(snapshot.nodeId, 200);
    const receivedAt = normalizedIsoDate(snapshot.receivedAt);
    if (
      !nodeId || !receivedAt || nodeIds.has(nodeId) ||
      snapshot.entries.length > MAX_CATALOG_ENTRIES_PER_SNAPSHOT
    ) throw new Error("私有网络目录缓存格式无效");
    nodeIds.add(nodeId);
    totalEntries += snapshot.entries.length;
    if (totalEntries > MAX_CATALOG_ENTRIES_TOTAL) {
      throw new Error("私有网络目录缓存条目过多");
    }
    return {
      nodeId,
      receivedAt,
      entries: snapshot.entries.map(parsePrivateMeshCatalogEntry),
    };
  });
  return { version: PRIVATE_MESH_CATALOG_VERSION, meshId, snapshots };
}

export function replacePrivateMeshCatalogSnapshot(
  current: PrivateMeshCatalogRecord | null,
  input: CatalogSnapshotInput,
): PrivateMeshCatalogRecord {
  const base: PrivateMeshCatalogRecord = current?.meshId === input.meshId
    ? current
    : { version: PRIVATE_MESH_CATALOG_VERSION, meshId: input.meshId, snapshots: [] };
  return parsePrivateMeshCatalogRecord({
    ...base,
    snapshots: [
      ...base.snapshots.filter((snapshot) => snapshot.nodeId !== input.nodeId),
      {
        nodeId: input.nodeId,
        receivedAt: input.receivedAt,
        entries: input.entries,
      },
    ],
  });
}

export function retainPrivateMeshCatalogMembers(
  current: PrivateMeshCatalogRecord | null,
  meshId: string,
  memberNodeIds: readonly string[],
): PrivateMeshCatalogRecord {
  const members = new Set(memberNodeIds);
  return parsePrivateMeshCatalogRecord({
    version: PRIVATE_MESH_CATALOG_VERSION,
    meshId,
    snapshots: current?.meshId === meshId
      ? current.snapshots.filter((snapshot) => members.has(snapshot.nodeId))
      : [],
  });
}

export const PRIVATE_MESH_MAX_CATALOG_ENTRIES = MAX_CATALOG_ENTRIES_PER_SNAPSHOT;
export const PRIVATE_MESH_MAX_THUMBNAIL_BYTES = MAX_THUMBNAIL_BYTES;
