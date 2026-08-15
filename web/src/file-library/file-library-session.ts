import type { LibraryItem, LibraryItemDetailsPatch } from "./model.ts";
import type { NativePhotoImporter } from "./native-photo-import.ts";
import {
  isMediaPlayerProgressMessage,
  type MediaPlayerProgressMessage,
} from "./media-player-url.ts";
import type {
  OpfsFileLibrary,
  StorageEstimate,
  VideoThumbnailRecord,
} from "./opfs-library.ts";
import {
  consumeSharedImport,
  installFileLaunchConsumer,
  registerOpenFxServiceWorker,
} from "./pwa-import.ts";

export type FileLibrarySessionSnapshot = Readonly<{
  items: LibraryItem[];
  busy: boolean;
  message: string;
  storage: StorageEstimate | null;
  nativePhotosAvailable: boolean;
}>;

export type FileLibrarySessionStore = Pick<
  OpfsFileLibrary,
  | "load"
  | "importFiles"
  | "getStoredFile"
  | "storeVideoThumbnail"
  | "recordPlayback"
  | "processPhoto"
  | "processFingerprint"
  | "retryFingerprintAnalysis"
  | "updateItemDetails"
  | "setFavorite"
  | "removeItem"
  | "estimate"
  | "persist"
>;

export type FileLibrarySession = ReturnType<typeof createFileLibrarySession>;

type SessionDependencies = {
  store: FileLibrarySessionStore;
  createVideoThumbnail: (source: File) => Promise<VideoThumbnailRecord>;
  defaultAppCount: number;
  isVisible?: () => boolean;
  nativePhotoImporter?: NativePhotoImporter;
};

type SessionListener = (snapshot: FileLibrarySessionSnapshot) => void;

const INITIAL_SNAPSHOT: FileLibrarySessionSnapshot = {
  items: [],
  busy: false,
  message: "正在打开本地文件库…",
  storage: null,
  nativePhotosAvailable: false,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isPendingPhoto(item: LibraryItem): boolean {
  return (item.kind === "image" || item.kind === "live-photo") &&
    item.processing?.status === "pending";
}

function isPendingFingerprint(item: LibraryItem): boolean {
  if (item.kind === "app" || item.fingerprint?.status !== "pending") return false;
  const isPhoto = item.kind === "image" || item.kind === "live-photo";
  return !isPhoto || item.processing?.status === "completed" ||
    item.processing?.status === "failed";
}

function isPendingThumbnail(item: LibraryItem): boolean {
  return item.kind === "video" && !item.preview;
}

export function createFileLibrarySession(dependencies: SessionDependencies) {
  const listeners = new Set<SessionListener>();
  const thumbnailFailures = new Set<string>();
  const photoFailures = new Set<string>();
  const fingerprintFailures = new Set<string>();
  const activeControllers = new Set<AbortController>();
  let snapshot = INITIAL_SNAPSHOT;
  let generation = 0;
  let active = false;
  let photoRun: Promise<void> | null = null;
  let fingerprintRun: Promise<void> | null = null;
  let thumbnailRun: Promise<void> | null = null;

  function publish(patch: Partial<FileLibrarySessionSnapshot>): void {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener(snapshot);
  }

  function belongsToCurrentRun(run: number): boolean {
    return active && run === generation;
  }

  function replaceItems(items: LibraryItem[]): void {
    publish({ items });
    startBackgroundWork();
  }

  async function refreshStorage(run = generation): Promise<void> {
    try {
      const storage = await dependencies.store.estimate();
      if (belongsToCurrentRun(run)) publish({ storage });
    } catch {
      if (belongsToCurrentRun(run)) publish({ storage: null });
    }
  }

  async function refreshNativePhotoAvailability(run = generation): Promise<void> {
    const nativePhotosAvailable =
      await dependencies.nativePhotoImporter?.isAvailable() ??
        false;
    if (belongsToCurrentRun(run)) publish({ nativePhotosAvailable });
  }

  async function retryFailedFingerprintsOnStart(
    items: LibraryItem[],
    run: number,
  ): Promise<{ items: LibraryItem[]; failed: boolean }> {
    const failedItems = items.filter((item) => item.fingerprint?.status === "failed");
    const retryNext = async (
      index: number,
      current: LibraryItem[],
      failed: boolean,
    ): Promise<{ items: LibraryItem[]; failed: boolean }> => {
      const item = failedItems[index];
      if (!item || !belongsToCurrentRun(run)) return { items: current, failed };
      fingerprintFailures.delete(item.id);
      try {
        // Each mutation returns the next complete index, so retries must stay serialized.
        const retried = await dependencies.store.retryFingerprintAnalysis(item.id);
        if (!belongsToCurrentRun(run)) return { items: current, failed };
        return retryNext(index + 1, retried, failed);
      } catch {
        if (!belongsToCurrentRun(run)) return { items: current, failed };
        return retryNext(index + 1, current, true);
      }
    };
    return retryNext(0, items, false);
  }

  async function runPhotoQueue(run: number): Promise<void> {
    let processed = false;
    while (belongsToCurrentRun(run)) {
      const item = snapshot.items.find((candidate) =>
        isPendingPhoto(candidate) && !photoFailures.has(candidate.id)
      );
      if (!item) break;
      const controller = new AbortController();
      activeControllers.add(controller);
      try {
        const items = await dependencies.store.processPhoto(item.id, controller.signal);
        if (!belongsToCurrentRun(run)) {
          controller.abort();
          return;
        }
        replaceItems(items);
        processed = true;
      } catch (error) {
        if (!belongsToCurrentRun(run)) return;
        photoFailures.add(item.id);
        publish({ message: errorMessage(error, "照片分析暂时失败，可稍后重试") });
      } finally {
        activeControllers.delete(controller);
      }
    }
    if (processed) await refreshStorage(run);
  }

  async function runFingerprintQueue(run: number): Promise<void> {
    while (belongsToCurrentRun(run)) {
      const item = snapshot.items.find((candidate) =>
        isPendingFingerprint(candidate) && !fingerprintFailures.has(candidate.id)
      );
      if (!item) break;
      const controller = new AbortController();
      activeControllers.add(controller);
      try {
        const items = await dependencies.store.processFingerprint(
          item.id,
          controller.signal,
        );
        if (!belongsToCurrentRun(run)) {
          controller.abort();
          return;
        }
        replaceItems(items);
      } catch (error) {
        if (!belongsToCurrentRun(run)) return;
        fingerprintFailures.add(item.id);
        publish({ message: errorMessage(error, "文件指纹分析暂时失败，可稍后重试") });
      } finally {
        activeControllers.delete(controller);
      }
    }
  }

  async function runThumbnailQueue(run: number): Promise<void> {
    if (dependencies.isVisible && !dependencies.isVisible()) return;
    let processed = false;
    while (belongsToCurrentRun(run)) {
      const item = snapshot.items.find((candidate) =>
        isPendingThumbnail(candidate) && !thumbnailFailures.has(candidate.id)
      );
      if (!item) break;
      try {
        const source = await dependencies.store.getStoredFile(item.source);
        const thumbnail = await dependencies.createVideoThumbnail(source);
        if (!belongsToCurrentRun(run)) return;
        replaceItems(
          await dependencies.store.storeVideoThumbnail(item.id, thumbnail),
        );
        processed = true;
      } catch {
        thumbnailFailures.add(item.id);
      }
    }
    if (processed) await refreshStorage(run);
  }

  function startBackgroundWork(): void {
    if (!active) return;
    const run = generation;
    if (
      !photoRun &&
      snapshot.items.some((item) => isPendingPhoto(item) && !photoFailures.has(item.id))
    ) {
      photoRun = runPhotoQueue(run).finally(() => {
        photoRun = null;
        startBackgroundWork();
      });
    }
    if (
      !fingerprintRun &&
      snapshot.items.some((item) =>
        isPendingFingerprint(item) && !fingerprintFailures.has(item.id)
      )
    ) {
      fingerprintRun = runFingerprintQueue(run).finally(() => {
        fingerprintRun = null;
        startBackgroundWork();
      });
    }
    if (
      !thumbnailRun && (!dependencies.isVisible || dependencies.isVisible()) &&
      snapshot.items.some((item) =>
        isPendingThumbnail(item) && !thumbnailFailures.has(item.id)
      )
    ) {
      thumbnailRun = runThumbnailQueue(run).finally(() => {
        thumbnailRun = null;
        startBackgroundWork();
      });
    }
  }

  async function start(): Promise<void> {
    if (active) return;
    active = true;
    const run = ++generation;
    publish(INITIAL_SNAPSHOT);
    try {
      const loadedItems = await dependencies.store.load();
      if (!belongsToCurrentRun(run)) return;
      const retry = await retryFailedFingerprintsOnStart(loadedItems, run);
      if (!belongsToCurrentRun(run)) return;
      const items = retry.items;
      const storedFileCount = items.filter((item) => item.kind !== "app").length;
      publish({
        items,
        message: retry.failed
          ? "部分文件指纹将在下次打开时重试"
          : storedFileCount > 0
          ? "导入内容仅保存在当前浏览器"
          : `${dependencies.defaultAppCount} 个默认 App 已就绪`,
      });
      startBackgroundWork();
      await refreshStorage(run);
      await refreshNativePhotoAvailability(run);
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法打开 OPFS 文件库") });
      }
    }
  }

  function stop(): void {
    active = false;
    generation += 1;
    for (const controller of activeControllers) controller.abort();
    activeControllers.clear();
  }

  async function importFiles(files: FileList | readonly File[]): Promise<boolean> {
    const batch = Array.from(files);
    if (!active || batch.length === 0 || snapshot.busy) return false;
    const run = generation;
    publish({ busy: true, message: `正在导入 ${batch.length} 个文件…` });
    try {
      const items = await dependencies.store.importFiles(batch);
      if (!belongsToCurrentRun(run)) return false;
      replaceItems(items);
      publish({ message: `已导入 ${batch.length} 个文件` });
      await refreshStorage(run);
      return true;
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "文件导入失败") });
      }
      return false;
    } finally {
      if (belongsToCurrentRun(run)) publish({ busy: false });
    }
  }

  async function importFromPhotos(): Promise<boolean> {
    const importer = dependencies.nativePhotoImporter;
    if (!active || !snapshot.nativePhotosAvailable || !importer || snapshot.busy) {
      return false;
    }
    const run = generation;
    publish({ busy: true, message: "正在打开 Photos…" });
    try {
      const files = await importer.pick();
      if (!belongsToCurrentRun(run)) return false;
      if (!files || files.length === 0) {
        publish({ message: "已取消选择" });
        return false;
      }
      const items = await dependencies.store.importFiles(files);
      if (!belongsToCurrentRun(run)) return false;
      replaceItems(items);
      publish({ message: "已从 Photos 导入 1 张实况照片" });
      await refreshStorage(run);
      return true;
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法从 Photos 导入实况照片") });
      }
      return false;
    } finally {
      if (belongsToCurrentRun(run)) publish({ busy: false });
    }
  }

  async function removeItem(id: string): Promise<boolean> {
    if (!active) return false;
    const run = generation;
    try {
      const items = await dependencies.store.removeItem(id);
      if (!belongsToCurrentRun(run)) return false;
      replaceItems(items);
      publish({ message: "已从文件库删除" });
      await refreshStorage(run);
      return true;
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法删除文件") });
      }
      return false;
    }
  }

  async function setFavorite(id: string, favorite: boolean): Promise<boolean> {
    if (!active) return false;
    const run = generation;
    try {
      const items = await dependencies.store.setFavorite(id, favorite);
      if (!belongsToCurrentRun(run)) return false;
      replaceItems(items);
      publish({ message: favorite ? "已收藏" : "已取消收藏" });
      return true;
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法更新收藏状态") });
      }
      return false;
    }
  }

  async function updateItemDetails(
    id: string,
    patch: LibraryItemDetailsPatch,
  ): Promise<boolean> {
    if (!active) return false;
    const run = generation;
    try {
      const items = await dependencies.store.updateItemDetails(id, patch);
      if (!belongsToCurrentRun(run)) return false;
      replaceItems(items);
      publish({ message: "已更新文件信息" });
      return true;
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法更新文件信息") });
      }
      return false;
    }
  }

  async function recordPlayback(message: MediaPlayerProgressMessage): Promise<void> {
    if (!active) return;
    const run = generation;
    const items = await dependencies.store.recordPlayback(message.itemId, {
      positionSec: message.positionSec,
      durationSec: message.durationSec,
      ended: message.ended,
    });
    if (belongsToCurrentRun(run)) replaceItems(items);
  }

  async function persistStorage(): Promise<void> {
    if (!active) return;
    const run = generation;
    await dependencies.store.persist();
    await refreshStorage(run);
  }

  async function whenIdle(): Promise<void> {
    while (photoRun || fingerprintRun || thumbnailRun) {
      await Promise.all([
        photoRun ?? Promise.resolve(),
        fingerprintRun ?? Promise.resolve(),
        thumbnailRun ?? Promise.resolve(),
      ]);
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: SessionListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    stop,
    importFiles,
    importFromPhotos,
    removeItem,
    setFavorite,
    updateItemDetails,
    recordPlayback,
    persistStorage,
    replaceItems,
    resumeBackgroundWork: startBackgroundWork,
    whenIdle,
  };
}

export function connectFileLibrarySessionToBrowser(
  session: FileLibrarySession,
): () => void {
  installFileLaunchConsumer(async (files) => {
    await session.importFiles(files);
  });
  void registerOpenFxServiceWorker().catch(() => undefined);
  void consumeSharedImport(location.search).then((files) => {
    if (files.length > 0) return session.importFiles(files);
  }).catch(() => undefined);

  const onMessage = (event: MessageEvent) => {
    if (
      event.origin === location.origin &&
      isMediaPlayerProgressMessage(event.data)
    ) {
      void session.recordPlayback(event.data);
    }
  };
  const onVisibilityChange = () => session.resumeBackgroundWork();
  globalThis.addEventListener("message", onMessage);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    globalThis.removeEventListener("message", onMessage);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
