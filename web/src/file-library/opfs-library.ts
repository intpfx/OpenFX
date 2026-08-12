import { dir, file, write } from "opfs-tools";

import {
  decodeLivpArchive,
  encodeLivpArchive,
  type LivpMetadata,
} from "../../../domains/_shared/livp-codec.ts";
import {
  classifyFile,
  createEmptyLibraryIndex,
  deriveLibraryWatchState,
  FILE_LIBRARY_INDEX_VERSION,
  type FileLibraryIndex,
  getFileExtension,
  type LibraryItem,
  type LibraryPhotoMetadata,
  linkSidecarSubtitles,
  normalizeLibraryUrl,
  pairLivePhotoFiles,
  parseLibraryIndex,
  parseLibraryMediaMetadata,
  sortLibraryItems,
  type StoredFileRef,
} from "./model.ts";
import { analyzePhotoInWorker } from "./photo-analysis.ts";
import {
  isDefaultLibraryApp,
  setDefaultLibraryAppFavorite,
  withDefaultLibraryApps,
} from "./default-apps.ts";
import { createPendingFileFingerprint } from "./similarity-core.ts";
import { analyzeFileFingerprintInWorker } from "./similarity-analysis.ts";
import { createVideoFingerprintFrames } from "./video-thumbnail.ts";

const LIBRARY_ROOT = "/openfx-file-library";
const LIBRARY_ITEMS_ROOT = `${LIBRARY_ROOT}/items`;
const LIBRARY_INDEX_PATH = `${LIBRARY_ROOT}/index.json`;

class UnsupportedLivpError extends Error {}

export type StorageEstimate = {
  usage: number;
  quota: number;
  persisted: boolean;
};

export type OpfsFileLibrary = ReturnType<typeof createOpfsFileLibrary>;

export type VideoThumbnailRecord = {
  blob: Blob;
  durationSec: number;
  selectedTimestampSec: number;
};

export type PlaybackUpdate = {
  positionSec: number;
  durationSec: number;
  ended?: boolean;
};

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function assertOpfsAvailable(): void {
  if (!globalThis.navigator?.storage?.getDirectory) {
    throw new Error(
      "当前浏览器不支持 OPFS，请使用最新版 Safari、Chrome、Edge 或 Firefox",
    );
  }
}

function storedRef(
  path: string,
  source: File | Blob,
  name: string,
  type: string,
): StoredFileRef {
  return {
    path,
    name,
    type,
    size: source.size,
    lastModified: source instanceof File ? source.lastModified : Date.now(),
  };
}

async function writeBlob(path: string, value: Blob): Promise<void> {
  await write(path, value.stream(), { overwrite: true });
}

async function readIndex(): Promise<FileLibraryIndex> {
  assertOpfsAvailable();
  await dir(LIBRARY_ITEMS_ROOT).create();
  const stored = file(LIBRARY_INDEX_PATH, "r");
  if (!await stored.exists()) return createEmptyLibraryIndex();
  try {
    return parseLibraryIndex(JSON.parse(await stored.text()));
  } catch {
    return createEmptyLibraryIndex();
  }
}

async function saveItems(items: readonly LibraryItem[]): Promise<LibraryItem[]> {
  const sorted = sortLibraryItems(linkSidecarSubtitles(items));
  await write(
    LIBRARY_INDEX_PATH,
    JSON.stringify({ version: FILE_LIBRARY_INDEX_VERSION, items: sorted }),
    { overwrite: true },
  );
  return sorted;
}

let mutationQueue: Promise<void> = Promise.resolve();

function mutateItems(
  update: (items: LibraryItem[]) => LibraryItem[] | Promise<LibraryItem[]>,
): Promise<LibraryItem[]> {
  const run = mutationQueue.then(async () => {
    const current = (await readIndex()).items;
    return await saveItems(await update(current));
  });
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

function baseItem(
  id: string,
  name: string,
  kind: LibraryItem["kind"],
  source: StoredFileRef,
  size: number,
): LibraryItem {
  const now = new Date().toISOString();
  const item = {
    id,
    name,
    kind,
    source,
    size,
    createdAt: now,
    updatedAt: now,
    fingerprint: createPendingFileFingerprint(),
  } satisfies LibraryItem;
  if (kind === "video") return { ...item, media: parseLibraryMediaMetadata(name) };
  if (kind === "image" || kind === "live-photo") {
    return {
      ...item,
      processing: { status: "pending", stage: "metadata", attempts: 0 },
    };
  }
  return item;
}

async function storeGenericFile(source: File): Promise<LibraryItem> {
  const id = createId();
  const path = `${LIBRARY_ITEMS_ROOT}/${id}/source`;
  await writeBlob(path, source);
  return baseItem(
    id,
    source.name,
    classifyFile(source),
    storedRef(path, source, source.name, source.type),
    source.size,
  );
}

async function storeLivePhotoPair(image: File, motion: File): Promise<LibraryItem> {
  const id = createId();
  const imagePath = `${LIBRARY_ITEMS_ROOT}/${id}/image`;
  const motionPath = `${LIBRARY_ITEMS_ROOT}/${id}/motion`;
  await Promise.all([writeBlob(imagePath, image), writeBlob(motionPath, motion)]);
  const item = baseItem(
    id,
    image.name,
    "live-photo",
    storedRef(imagePath, image, image.name, image.type),
    image.size + motion.size,
  );
  return {
    ...item,
    motion: storedRef(
      motionPath,
      motion,
      motion.name,
      motion.type || "video/quicktime",
    ),
  };
}

async function storeLivp(source: File): Promise<LibraryItem> {
  let decoded;
  try {
    decoded = await decodeLivpArchive(new Uint8Array(await source.arrayBuffer()));
  } catch (error) {
    throw new UnsupportedLivpError(
      error instanceof Error ? error.message : "Unsupported LIVP",
    );
  }
  const id = createId();
  const archivePath = `${LIBRARY_ITEMS_ROOT}/${id}/source`;
  const imagePath = `${LIBRARY_ITEMS_ROOT}/${id}/image`;
  const motionPath = `${LIBRARY_ITEMS_ROOT}/${id}/motion`;
  const imageName = source.name.replace(/\.livp$/i, `.${decoded.metadata.imageFormat}`);
  const motionName = source.name.replace(
    /\.livp$/i,
    `.${decoded.metadata.videoFormat}`,
  );
  const image = new Blob([
    decoded.image.buffer.slice(
      decoded.image.byteOffset,
      decoded.image.byteOffset + decoded.image.byteLength,
    ) as ArrayBuffer,
  ], { type: decoded.imageMimeType });
  const motion = new Blob([
    decoded.video.buffer.slice(
      decoded.video.byteOffset,
      decoded.video.byteOffset + decoded.video.byteLength,
    ) as ArrayBuffer,
  ], { type: decoded.videoMimeType });

  await Promise.all([
    writeBlob(archivePath, source),
    writeBlob(imagePath, image),
    writeBlob(motionPath, motion),
  ]);

  const item = baseItem(
    id,
    source.name,
    "live-photo",
    storedRef(archivePath, source, source.name, source.type || "application/x-livp"),
    source.size,
  );
  return {
    ...item,
    preview: storedRef(imagePath, image, imageName, decoded.imageMimeType),
    motion: storedRef(motionPath, motion, motionName, decoded.videoMimeType),
  };
}

async function importFiles(input: readonly File[]): Promise<LibraryItem[]> {
  const files = input.filter((candidate) =>
    candidate.size >= 0 && candidate.name.trim()
  );
  if (files.length === 0) return (await readIndex()).items;

  const created: LibraryItem[] = [];
  const { pairs, remaining } = pairLivePhotoFiles(files);

  try {
    for (const pair of pairs) {
      created.push(await storeLivePhotoPair(pair.image, pair.motion));
    }

    for (const source of remaining) {
      if (getFileExtension(source.name) === "livp") {
        try {
          created.push(await storeLivp(source));
          continue;
        } catch (error) {
          if (!(error instanceof UnsupportedLivpError)) throw error;
          // Unknown .livp variants remain safely downloadable instead of being discarded.
        }
      }

      created.push(await storeGenericFile(source));
    }

    return await mutateItems((items) => [...created, ...items]);
  } catch (error) {
    await Promise.allSettled(
      created.map((item) =>
        dir(`${LIBRARY_ITEMS_ROOT}/${item.id}`).remove({ force: true })
      ),
    );
    throw error;
  }
}

async function createText(name: string, content: string): Promise<LibraryItem[]> {
  const title = name.trim() || "未命名文本";
  const filename = /\.[a-z0-9]+$/i.test(title) ? title : `${title}.txt`;
  const value = new File([content], filename, { type: "text/plain;charset=utf-8" });
  const item = await storeGenericFile(value);
  return await mutateItems((items) => [item, ...items]);
}

async function createLink(name: string, inputUrl: string): Promise<LibraryItem[]> {
  const url = normalizeLibraryUrl(inputUrl);
  const parsed = new URL(url);
  const title = name.trim() || parsed.hostname;
  const id = createId();
  const value = new File([url], `${title}.url`, { type: "text/uri-list" });
  const path = `${LIBRARY_ITEMS_ROOT}/${id}/source`;
  await writeBlob(path, value);
  const item = {
    ...baseItem(
      id,
      title,
      "link",
      storedRef(path, value, value.name, value.type),
      value.size,
    ),
    url,
  } satisfies LibraryItem;
  return await mutateItems((items) => [item, ...items]);
}

async function getStoredFile(reference: StoredFileRef): Promise<File> {
  const origin = await file(reference.path, "r").getOriginFile();
  if (!origin) throw new Error(`找不到已存储文件：${reference.name}`);
  return new File([origin], reference.name, {
    type: reference.type,
    lastModified: reference.lastModified,
  });
}

async function removeStoredItem(id: string): Promise<LibraryItem[]> {
  if (id.startsWith("openfx-app:")) {
    return withDefaultLibraryApps((await readIndex()).items);
  }
  const currentItems = (await readIndex()).items;
  const item = currentItems.find((candidate) => candidate.id === id);
  if (!item) return currentItems;
  await dir(`${LIBRARY_ITEMS_ROOT}/${id}`).remove({ force: true });
  return await mutateItems((items) => items.filter((candidate) => candidate.id !== id));
}

async function storeVideoThumbnail(
  id: string,
  thumbnail: VideoThumbnailRecord,
): Promise<LibraryItem[]> {
  const path = `${LIBRARY_ITEMS_ROOT}/${id}/thumbnail.webp`;
  await writeBlob(path, thumbnail.blob);
  return await mutateItems((items) =>
    items.map((item) => {
      if (item.id !== id || item.kind !== "video") return item;
      const now = Date.now();
      return {
        ...item,
        updatedAt: new Date(now).toISOString(),
        preview: storedRef(
          path,
          thumbnail.blob,
          `${item.source.name.replace(/\.[^.]+$/, "")}.thumbnail.webp`,
          thumbnail.blob.type || "image/webp",
        ),
        media: {
          ...(item.media ?? parseLibraryMediaMetadata(item.name)),
          thumbnailTimestampSec: thumbnail.selectedTimestampSec,
        },
        playback: item.playback
          ? {
            ...item.playback,
            durationSec: thumbnail.durationSec || item.playback.durationSec,
          }
          : undefined,
      };
    })
  );
}

async function recordPlayback(
  id: string,
  update: PlaybackUpdate,
): Promise<LibraryItem[]> {
  return await mutateItems((items) =>
    items.map((item) => {
      if (item.id !== id || item.kind !== "video") return item;
      const playback = {
        positionSec: Math.max(0, update.positionSec),
        durationSec: Math.max(0, update.durationSec),
        watchState: deriveLibraryWatchState({
          positionSec: update.positionSec,
          durationSec: update.durationSec,
          previous: item.playback?.watchState,
          ended: update.ended,
        }),
        lastPlayedAt: new Date().toISOString(),
      };
      return { ...item, playback, updatedAt: playback.lastPlayedAt };
    })
  );
}

async function processPhoto(id: string, signal?: AbortSignal): Promise<LibraryItem[]> {
  let selected: LibraryItem | undefined;
  await mutateItems((items) =>
    items.map((item) => {
      if (item.id !== id || (item.kind !== "image" && item.kind !== "live-photo")) {
        return item;
      }
      selected = item;
      return {
        ...item,
        processing: {
          status: "running",
          stage: "metadata",
          attempts: (item.processing?.attempts ?? 0) + 1,
        },
      };
    })
  );
  if (!selected) return (await readIndex()).items;

  try {
    const source = await getStoredFile(selected.preview ?? selected.source);
    const result = await analyzePhotoInWorker(source, signal);
    let motionRef = selected.motion;
    if (result.motion && !motionRef) {
      const motionPath = `${LIBRARY_ITEMS_ROOT}/${id}/motion`;
      await writeBlob(motionPath, result.motion);
      motionRef = storedRef(
        motionPath,
        result.motion,
        `${source.name.replace(/\.[^.]+$/, "")}.mp4`,
        result.motion.type || "video/mp4",
      );
    }
    return await mutateItems((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const updatedAt = new Date().toISOString();
        return {
          ...item,
          kind: motionRef ? "live-photo" : item.kind,
          motion: motionRef,
          size: motionRef && !item.motion ? item.size + motionRef.size : item.size,
          photo: { ...item.photo, ...result.metadata },
          processing: {
            status: "completed",
            stage: "motion-photo",
            attempts: item.processing?.attempts ?? 1,
          },
          updatedAt,
        };
      })
    );
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return await mutateItems((items) =>
      items.map((item) =>
        item.id === id
          ? {
            ...item,
            processing: {
              status: aborted ? "pending" : "failed",
              stage: item.processing?.stage ?? "metadata",
              attempts: item.processing?.attempts ?? 1,
              error: aborted
                ? undefined
                : error instanceof Error
                ? error.message
                : "照片分析失败",
            },
          }
          : item
      )
    );
  }
}

async function retryPhotoAnalysis(id: string): Promise<LibraryItem[]> {
  return await mutateItems((items) =>
    items.map((item) =>
      item.id === id && (item.kind === "image" || item.kind === "live-photo")
        ? {
          ...item,
          processing: {
            status: "pending",
            stage: "metadata",
            attempts: item.processing?.attempts ?? 0,
          },
        }
        : item
    )
  );
}

async function processFingerprint(
  id: string,
  signal?: AbortSignal,
): Promise<LibraryItem[]> {
  let selected: LibraryItem | undefined;
  await mutateItems((items) =>
    items.map((item) => {
      if (item.id !== id) return item;
      selected = item;
      return {
        ...item,
        fingerprint: {
          ...createPendingFileFingerprint(),
          status: "running" as const,
          updatedAt: new Date().toISOString(),
        },
      };
    })
  );
  if (!selected) return (await readIndex()).items;

  try {
    const visualRef = selected.kind === "live-photo"
      ? selected.preview ?? selected.source
      : selected.source;
    const source = await getStoredFile(visualRef);
    const motion = selected.motion ? await getStoredFile(selected.motion) : undefined;
    let video;
    let visualError: string | undefined;
    const videoSource = selected.kind === "video" ? source : motion;
    if (videoSource) {
      try {
        video = await createVideoFingerprintFrames(videoSource);
      } catch (error) {
        visualError = error instanceof Error ? error.message : "视频帧提取失败";
      }
    }
    const fingerprint = await analyzeFileFingerprintInWorker({
      source,
      motion,
      still: selected.kind === "image" || selected.kind === "live-photo"
        ? source
        : undefined,
      video,
    }, signal);
    if (visualError) {
      fingerprint.error = `视觉指纹不可用：${visualError}`;
    }
    return await mutateItems((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, fingerprint, updatedAt: new Date().toISOString() }
          : item
      )
    );
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return await mutateItems((items) =>
      items.map((item) =>
        item.id === id
          ? {
            ...item,
            fingerprint: {
              ...createPendingFileFingerprint(),
              status: aborted ? "pending" as const : "failed" as const,
              updatedAt: new Date().toISOString(),
              error: aborted
                ? undefined
                : error instanceof Error
                ? error.message
                : "文件指纹分析失败",
            },
          }
          : item
      )
    );
  }
}

async function retryFingerprintAnalysis(id: string): Promise<LibraryItem[]> {
  return await mutateItems((items) =>
    items.map((item) =>
      item.id === id ? { ...item, fingerprint: createPendingFileFingerprint() } : item
    )
  );
}

async function updatePhotoDetails(
  id: string,
  patch: { favorite?: boolean; albums?: string[]; photo?: LibraryPhotoMetadata },
): Promise<LibraryItem[]> {
  return await mutateItems((items) =>
    items.map((item) => {
      if (item.id !== id || (item.kind !== "image" && item.kind !== "live-photo")) {
        return item;
      }
      const albums = patch.albums?.map((album) => album.trim()).filter(Boolean)
        .filter((album, index, values) => values.indexOf(album) === index);
      return {
        ...item,
        favorite: patch.favorite ?? item.favorite,
        albums: albums ?? item.albums,
        photo: patch.photo ? { ...item.photo, ...patch.photo } : item.photo,
        updatedAt: new Date().toISOString(),
      };
    })
  );
}

async function setFavorite(
  id: string,
  favorite: boolean,
): Promise<LibraryItem[]> {
  if (id.startsWith("openfx-app:")) {
    setDefaultLibraryAppFavorite(id, favorite);
    return withDefaultLibraryApps((await readIndex()).items);
  }
  return await mutateItems((items) =>
    items.map((item) =>
      item.id === id ? { ...item, favorite, updatedAt: new Date().toISOString() } : item
    )
  );
}

async function exportLivePhoto(item: LibraryItem): Promise<File> {
  if (item.kind !== "live-photo" || !item.motion) {
    throw new Error("此条目不是完整的实况图片");
  }
  const [image, motion] = await Promise.all([
    getStoredFile(item.preview ?? item.source),
    getStoredFile(item.motion),
  ]);
  const imageFormat = getFileExtension(image.name) || "jpg";
  const videoFormat = getFileExtension(motion.name) || "mov";
  const metadata: LivpMetadata = {
    version: "2",
    timestamp: item.photo?.capturedAt ?? item.createdAt,
    stillImageTime: 0,
    imageFormat,
    videoFormat,
    photo: item.photo,
  };
  const encoded = encodeLivpArchive(
    new Uint8Array(await image.arrayBuffer()),
    new Uint8Array(await motion.arrayBuffer()),
    metadata,
  );
  const name = item.name.replace(/\.[^.]+$/, "") || "Live Photo";
  const bytes = encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  ) as ArrayBuffer;
  return new File([bytes], `${name}.livp`, { type: "application/zip" });
}

async function estimate(): Promise<StorageEstimate> {
  assertOpfsAvailable();
  const [value, persisted] = await Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted?.() ?? Promise.resolve(false),
  ]);
  return {
    usage: value.usage ?? 0,
    quota: value.quota ?? 0,
    persisted,
  };
}

export function createOpfsFileLibrary() {
  return {
    load: async () => {
      await mutationQueue;
      return withDefaultLibraryApps(sortLibraryItems((await readIndex()).items));
    },
    importFiles: async (input: readonly File[]) =>
      withDefaultLibraryApps(await importFiles(input)),
    createText: async (name: string, content: string) =>
      withDefaultLibraryApps(await createText(name, content)),
    createLink: async (name: string, inputUrl: string) =>
      withDefaultLibraryApps(await createLink(name, inputUrl)),
    getStoredFile,
    storeVideoThumbnail: async (id: string, thumbnail: VideoThumbnailRecord) =>
      withDefaultLibraryApps(await storeVideoThumbnail(id, thumbnail)),
    recordPlayback: async (id: string, update: PlaybackUpdate) =>
      withDefaultLibraryApps(await recordPlayback(id, update)),
    processPhoto: async (id: string, signal?: AbortSignal) =>
      withDefaultLibraryApps(await processPhoto(id, signal)),
    retryPhotoAnalysis: async (id: string) =>
      withDefaultLibraryApps(await retryPhotoAnalysis(id)),
    processFingerprint: async (id: string, signal?: AbortSignal) =>
      withDefaultLibraryApps(await processFingerprint(id, signal)),
    retryFingerprintAnalysis: async (id: string) =>
      withDefaultLibraryApps(await retryFingerprintAnalysis(id)),
    updatePhotoDetails: async (
      id: string,
      patch: { favorite?: boolean; albums?: string[]; photo?: LibraryPhotoMetadata },
    ) => withDefaultLibraryApps(await updatePhotoDetails(id, patch)),
    setFavorite: async (id: string, favorite: boolean) =>
      withDefaultLibraryApps(await setFavorite(id, favorite)),
    exportLivePhoto,
    removeItem: async (id: string) =>
      withDefaultLibraryApps(await removeStoredItem(id)),
    isDefaultApp: isDefaultLibraryApp,
    estimate,
    persist: async () => await navigator.storage.persist?.() ?? false,
  };
}

export const OPENFX_FILE_LIBRARY_ROOT = LIBRARY_ROOT;
