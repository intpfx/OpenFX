import { dir, file, write } from "opfs-tools";

import {
  parsePrivateMeshCatalogRecord,
  PRIVATE_MESH_MAX_THUMBNAIL_BYTES,
  type PrivateMeshCatalogRecord,
} from "./private-mesh-catalog.ts";

const PRIVATE_MESH_ROOT = "/openfx-private-mesh";
const PRIVATE_MESH_CATALOG_PATH = `${PRIVATE_MESH_ROOT}/catalog.json`;
const PRIVATE_MESH_THUMBNAIL_ROOT = `${PRIVATE_MESH_ROOT}/thumbnails`;

export type PrivateMeshThumbnailCacheKey = Readonly<{
  meshId: string;
  nodeId: string;
  itemId: string;
  revision: string;
}>;

export type PrivateMeshCatalogStore = ReturnType<
  typeof createOpfsPrivateMeshCatalogStore
>;
export type PrivateMeshThumbnailStore = ReturnType<
  typeof createOpfsPrivateMeshThumbnailStore
>;

function assertOpfsAvailable(): void {
  if (!globalThis.navigator?.storage?.getDirectory) {
    throw new Error("当前浏览器不支持 OPFS，无法保存远程目录缓存");
  }
}

function assertCacheKey(key: PrivateMeshThumbnailCacheKey): void {
  if (
    !key.meshId || key.meshId.length > 200 ||
    !key.nodeId || key.nodeId.length > 200 ||
    !key.itemId || key.itemId.length > 200 ||
    !key.revision || key.revision.length > 200
  ) throw new Error("私有网络缩略图缓存键无效");
}

async function thumbnailCachePath(
  key: PrivateMeshThumbnailCacheKey,
): Promise<string> {
  assertCacheKey(key);
  const source = new TextEncoder().encode(JSON.stringify([
    key.meshId,
    key.nodeId,
    key.itemId,
    key.revision,
  ]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", source));
  const encoded = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${PRIVATE_MESH_THUMBNAIL_ROOT}/${encoded}.webp`;
}

export function createOpfsPrivateMeshCatalogStore() {
  return {
    async load(): Promise<PrivateMeshCatalogRecord | null> {
      assertOpfsAvailable();
      await dir(PRIVATE_MESH_ROOT).create();
      const stored = file(PRIVATE_MESH_CATALOG_PATH, "r");
      if (!await stored.exists()) return null;
      try {
        return parsePrivateMeshCatalogRecord(JSON.parse(await stored.text()));
      } catch {
        throw new Error("私有网络目录缓存已损坏");
      }
    },
    async save(record: PrivateMeshCatalogRecord): Promise<void> {
      assertOpfsAvailable();
      const normalized = parsePrivateMeshCatalogRecord(record);
      await dir(PRIVATE_MESH_ROOT).create();
      await write(PRIVATE_MESH_CATALOG_PATH, JSON.stringify(normalized), {
        overwrite: true,
      });
    },
  };
}

export function createOpfsPrivateMeshThumbnailStore() {
  return {
    async load(key: PrivateMeshThumbnailCacheKey): Promise<Blob | null> {
      assertOpfsAvailable();
      const stored = file(await thumbnailCachePath(key), "r");
      if (!await stored.exists()) return null;
      const source = await stored.getOriginFile();
      if (!source || source.size > PRIVATE_MESH_MAX_THUMBNAIL_BYTES) {
        throw new Error("私有网络缩略图缓存已损坏");
      }
      return new Blob([await source.arrayBuffer()], { type: "image/webp" });
    },
    async save(
      key: PrivateMeshThumbnailCacheKey,
      thumbnail: Blob,
    ): Promise<void> {
      assertOpfsAvailable();
      if (
        thumbnail.type !== "image/webp" ||
        thumbnail.size > PRIVATE_MESH_MAX_THUMBNAIL_BYTES
      ) throw new Error("私有网络缩略图格式无效或超过 128 KiB");
      await dir(PRIVATE_MESH_THUMBNAIL_ROOT).create();
      await write(await thumbnailCachePath(key), await thumbnail.arrayBuffer(), {
        overwrite: true,
      });
    },
    async remove(key: PrivateMeshThumbnailCacheKey): Promise<void> {
      assertOpfsAvailable();
      const stored = file(await thumbnailCachePath(key), "rw");
      if (await stored.exists()) await stored.remove({ force: true });
    },
  };
}
