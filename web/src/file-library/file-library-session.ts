import {
  getFileExtension,
  type LibraryItem,
  type LibraryItemDetailsPatch,
} from "./model.ts";
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
import {
  acceptPairingApproval,
  acceptPrivateMeshEpochUpdate as acceptPrivateMeshEpochUpdateState,
  approvePairingRequest,
  createPairingRequest,
  createPrivateMesh,
  revokePrivateMeshMember as revokePrivateMeshMemberState,
} from "./private-mesh.ts";
import {
  createEmptyPrivateMeshLocalRecord,
  type PrivateMeshLocalRecord,
  type PrivateMeshStore,
} from "./private-mesh-store.ts";
import {
  createMemoryPrivateMeshKeyVault,
  type PrivateMeshKeyVault,
} from "./private-mesh-key-vault.ts";
import {
  acceptPrivateMeshConnectionOffer,
  closePrivateMeshConnection,
  completePrivateMeshConnectionOffer,
  createPrivateMeshConnectionOffer,
  type PrivateMeshRtcConnection,
  waitForPrivateMeshChannel,
} from "./private-mesh-transport.ts";
import {
  createPrivateMeshTransferSession,
  PRIVATE_MESH_PRESERVE_ABORT_REASON,
  type PrivateMeshCatalogEntry,
} from "./private-mesh-transfer.ts";
import { createPrivateMeshCatalogRefreshQueue } from "./private-mesh-catalog-sync.ts";
import {
  type PrivateMeshCatalogRecord,
  type PrivateMeshCatalogSnapshot,
  replacePrivateMeshCatalogSnapshot,
  retainPrivateMeshCatalogMembers,
} from "./private-mesh-catalog.ts";
import type {
  PrivateMeshCatalogStore,
  PrivateMeshThumbnailCacheKey,
  PrivateMeshThumbnailStore,
} from "./private-mesh-catalog-store.ts";
import {
  describePrivateMeshThumbnail,
  getPrivateMeshThumbnailSource,
} from "./private-mesh-thumbnail.ts";
import type {
  LocalDirectorySource,
  LocalDirectorySourceSnapshot,
} from "./local-directory-source.ts";

const MAX_PRIVATE_MESH_REMOTE_THUMBNAIL_REQUESTS = 32;

export type PrivateMeshConnectionSnapshot = Readonly<{
  nodeId: string;
  nodeName: string;
  status: "connecting" | "connected" | "error";
  message?: string;
}>;

export type PrivateMeshRemoteFileSnapshot =
  & PrivateMeshCatalogEntry
  & Readonly<{
    nodeId: string;
    nodeName: string;
    receivedAt: string;
    availability: "online" | "cached";
  }>;

export type PrivateMeshSessionSnapshot =
  | Readonly<{ status: "loading" }>
  | Readonly<{
    status: "unconfigured";
    pendingPairing:
      | null
      | Readonly<{
        nodeName: string;
        requestCode: string;
        verificationCode: string;
        expiresAt: string;
      }>;
  }>
  | Readonly<{
    status: "ready";
    meshId: string;
    meshName: string;
    epoch: number;
    localNodeId: string;
    localNodeName: string;
    localNodeRole: "owner" | "member";
    canInvite: boolean;
    memberCount: number;
    members: readonly Readonly<{
      nodeId: string;
      nodeName: string;
      role: "owner" | "member";
    }>[];
    pendingEpochUpdates: readonly Readonly<{
      nodeId: string;
      nodeName: string;
      updateCode: string;
    }>[];
    connections: readonly PrivateMeshConnectionSnapshot[];
    remoteFiles: readonly PrivateMeshRemoteFileSnapshot[];
  }>
  | Readonly<{ status: "error"; message: string }>;

export type FileLibrarySessionSnapshot = Readonly<{
  items: LibraryItem[];
  busy: boolean;
  message: string;
  storage: StorageEstimate | null;
  nativePhotosAvailable: boolean;
  sourceMode: "opfs" | "directory";
  localDirectory: LocalDirectorySourceSnapshot;
  privateMesh: PrivateMeshSessionSnapshot;
}>;

export type FileLibrarySessionStore =
  & Pick<
    OpfsFileLibrary,
    | "load"
    | "importFiles"
    | "getStoredFile"
    | "storeVideoThumbnail"
    | "recordPlayback"
    | "processPhoto"
    | "processAudio"
    | "processFingerprint"
    | "retryFingerprintAnalysis"
    | "updateItemDetails"
    | "setFavorite"
    | "removeItem"
    | "estimate"
    | "persist"
  >
  & Partial<Pick<OpfsFileLibrary, "createPrivateMeshRemoteFileSink">>;

export type FileLibrarySession = ReturnType<typeof createFileLibrarySession>;

type SessionDependencies = {
  store: FileLibrarySessionStore;
  createVideoThumbnail: (source: File) => Promise<VideoThumbnailRecord>;
  defaultAppCount: number;
  isVisible?: () => boolean;
  nativePhotoImporter?: NativePhotoImporter;
  privateMeshStore?: Pick<PrivateMeshStore, "load" | "save">;
  privateMeshCatalogStore?: Pick<PrivateMeshCatalogStore, "load" | "save">;
  privateMeshThumbnailStore?: Pick<
    PrivateMeshThumbnailStore,
    "load" | "save" | "remove"
  >;
  createPrivateMeshThumbnail?: (source: File) => Promise<Blob>;
  localDirectorySource?: LocalDirectorySource;
  privateMeshKeyVault?: PrivateMeshKeyVault;
  createPeerConnection?: () => RTCPeerConnection;
  now?: () => string;
};

type SessionListener = (snapshot: FileLibrarySessionSnapshot) => void;

type ActivePrivateMeshConnection = {
  connection: PrivateMeshRtcConnection;
  status: PrivateMeshConnectionSnapshot["status"];
  message?: string;
  transfer?: ReturnType<typeof createPrivateMeshTransferSession>;
};

const INITIAL_SNAPSHOT: FileLibrarySessionSnapshot = {
  items: [],
  busy: false,
  message: "正在打开本地文件库…",
  storage: null,
  nativePhotosAvailable: false,
  sourceMode: "opfs",
  localDirectory: {
    supported: false,
    status: "unsupported",
    directoryName: null,
    entries: [],
  },
  privateMesh: { status: "loading" },
};

function privateMeshSnapshot(
  record: PrivateMeshLocalRecord,
  connections: readonly PrivateMeshConnectionSnapshot[] = [],
  remoteFiles: readonly PrivateMeshRemoteFileSnapshot[] = [],
): PrivateMeshSessionSnapshot {
  if (!record.state) {
    return {
      status: "unconfigured",
      pendingPairing: record.pendingPairing
        ? {
          nodeName: record.pendingPairing.request.payload.nodeName,
          requestCode: record.pendingPairing.requestCode,
          verificationCode: record.pendingPairing.verificationCode,
          expiresAt: record.pendingPairing.request.payload.expiresAt,
        }
        : null,
    };
  }
  const state = record.state;
  return {
    status: "ready",
    meshId: state.descriptor.meshId,
    meshName: state.descriptor.name,
    epoch: state.descriptor.epoch,
    localNodeId: state.localNode.nodeId,
    localNodeName: state.localNode.nodeName,
    localNodeRole: state.localNode.role,
    canInvite: state.localNode.capabilities.invite && Boolean(state.rootSigningKey),
    memberCount: state.members.length,
    members: state.members.map((member) => ({
      nodeId: member.payload.nodeId,
      nodeName: member.payload.nodeName,
      role: member.payload.role,
    })),
    pendingEpochUpdates: state.pendingEpochUpdates,
    connections,
    remoteFiles,
  };
}

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

function isPendingAudio(item: LibraryItem): boolean {
  return item.kind === "audio" && item.audioProcessing?.status === "pending";
}

export function createFileLibrarySession(dependencies: SessionDependencies) {
  const localDirectorySource = dependencies.localDirectorySource;
  const privateMeshKeyVault = dependencies.privateMeshKeyVault ??
    createMemoryPrivateMeshKeyVault();
  const listeners = new Set<SessionListener>();
  const thumbnailFailures = new Set<string>();
  const photoFailures = new Set<string>();
  const audioFailures = new Set<string>();
  const fingerprintFailures = new Set<string>();
  const activeControllers = new Set<AbortController>();
  let snapshot: FileLibrarySessionSnapshot = {
    ...INITIAL_SNAPSHOT,
    localDirectory: localDirectorySource?.getSnapshot() ??
      INITIAL_SNAPSHOT.localDirectory,
  };
  let generation = 0;
  let active = false;
  let photoRun: Promise<void> | null = null;
  let audioRun: Promise<void> | null = null;
  let fingerprintRun: Promise<void> | null = null;
  let thumbnailRun: Promise<void> | null = null;
  let privateMeshRecord = createEmptyPrivateMeshLocalRecord();
  let privateMeshCatalogRecord: PrivateMeshCatalogRecord | null = null;
  const privateMeshConnections = new Map<string, ActivePrivateMeshConnection>();
  const remotePrivateMeshCatalogs = new Map<
    string,
    PrivateMeshCatalogSnapshot
  >();
  const privateMeshThumbnailRequests = new Map<
    string,
    Promise<Blob | null>
  >();
  const attemptedPrivateMeshThumbnails = new Set<string>();
  let privateMeshRemoteFileImportController: AbortController | null = null;
  let localPrivateMeshCatalogSignature = JSON.stringify([]);
  const privateMeshCatalogRefreshQueue = createPrivateMeshCatalogRefreshQueue(
    async (nodeId) => {
      await refreshRuntimeCatalog(nodeId, generation, { announce: false });
    },
  );

  function currentPrivateMeshSnapshot(
    record = privateMeshRecord,
  ): PrivateMeshSessionSnapshot {
    const state = record.state;
    const nodeName = (nodeId: string) =>
      state?.members.find((member) => member.payload.nodeId === nodeId)?.payload
        .nodeName ?? nodeId;
    const connections = [...privateMeshConnections].map(([nodeId, active]) => ({
      nodeId,
      nodeName: nodeName(nodeId),
      status: active.status,
      message: active.message,
    }));
    const remoteFiles = [...remotePrivateMeshCatalogs].flatMap(
      ([nodeId, catalog]) =>
        catalog.entries.map((entry) => ({
          ...entry,
          nodeId,
          nodeName: nodeName(nodeId),
          receivedAt: catalog.receivedAt,
          availability: privateMeshConnections.get(nodeId)?.status === "connected"
            ? "online" as const
            : "cached" as const,
        })),
    );
    return privateMeshSnapshot(record, connections, remoteFiles);
  }

  function publishPrivateMeshRuntime(message?: string): void {
    publish({
      privateMesh: currentPrivateMeshSnapshot(),
      ...(message ? { message } : {}),
    });
  }

  function closeRuntimeConnection(nodeId: string): void {
    const activeConnection = privateMeshConnections.get(nodeId);
    if (!activeConnection) return;
    privateMeshCatalogRefreshQueue.cancel(nodeId);
    activeConnection.transfer?.dispose();
    closePrivateMeshConnection(activeConnection.connection);
    privateMeshConnections.delete(nodeId);
  }

  function installRuntimeCatalogRecord(record: PrivateMeshCatalogRecord): void {
    remotePrivateMeshCatalogs.clear();
    for (const catalog of record.snapshots) {
      remotePrivateMeshCatalogs.set(catalog.nodeId, catalog);
    }
  }

  function catalogThumbnailCacheKeys(
    record: PrivateMeshCatalogRecord | null,
  ): Map<string, PrivateMeshThumbnailCacheKey> {
    const keys = new Map<string, PrivateMeshThumbnailCacheKey>();
    if (!record) return keys;
    for (const catalog of record.snapshots) {
      for (const entry of catalog.entries) {
        if (!entry.thumbnail) continue;
        const key = {
          meshId: record.meshId,
          nodeId: catalog.nodeId,
          itemId: entry.itemId,
          revision: entry.thumbnail.revision,
        };
        keys.set(JSON.stringify(key), key);
      }
    }
    return keys;
  }

  async function removeStalePrivateMeshThumbnails(
    previous: PrivateMeshCatalogRecord | null,
    current: PrivateMeshCatalogRecord | null,
  ): Promise<void> {
    const store = dependencies.privateMeshThumbnailStore;
    if (!store) return;
    const retained = catalogThumbnailCacheKeys(current);
    const removals = [...catalogThumbnailCacheKeys(previous)]
      .filter(([serialized]) => !retained.has(serialized))
      .map(([, key]) => store.remove(key));
    await Promise.allSettled(removals);
  }

  async function retainCurrentPrivateMeshCatalog(
    run: number,
    persistChanges: boolean,
  ): Promise<string | null> {
    const state = privateMeshRecord.state;
    if (!state) {
      privateMeshCatalogRecord = null;
      remotePrivateMeshCatalogs.clear();
      return null;
    }
    const remoteMemberNodeIds: string[] = [];
    for (const member of state.members) {
      if (member.payload.nodeId !== state.localNode.nodeId) {
        remoteMemberNodeIds.push(member.payload.nodeId);
      }
    }
    const retained = retainPrivateMeshCatalogMembers(
      privateMeshCatalogRecord,
      state.descriptor.meshId,
      remoteMemberNodeIds,
    );
    const previous = privateMeshCatalogRecord;
    const changed = JSON.stringify(retained) !==
      JSON.stringify(privateMeshCatalogRecord);
    privateMeshCatalogRecord = retained;
    installRuntimeCatalogRecord(retained);
    if (changed) await removeStalePrivateMeshThumbnails(previous, retained);
    if (
      !persistChanges || !changed || !dependencies.privateMeshCatalogStore ||
      !belongsToCurrentRun(run)
    ) return null;
    try {
      await dependencies.privateMeshCatalogStore.save(retained);
      return null;
    } catch {
      return "远程目录缓存暂时无法更新";
    }
  }

  function localPrivateMeshCatalog(
    items = snapshot.items,
  ): readonly PrivateMeshCatalogEntry[] {
    return items
      .filter((item): item is LibraryItem & {
        kind: Exclude<LibraryItem["kind"], "app" | "live-photo">;
      } => item.kind !== "app" && item.kind !== "live-photo")
      .map((item) => {
        const thumbnail = dependencies.createPrivateMeshThumbnail
          ? describePrivateMeshThumbnail(item)
          : undefined;
        return {
          itemId: item.id,
          name: item.name,
          kind: item.kind,
          type: item.source.type,
          size: item.source.size,
          updatedAt: item.updatedAt,
          ...(thumbnail ? { thumbnail } : {}),
        };
      });
  }

  function broadcastLocalPrivateMeshCatalogChange(): void {
    for (const activeConnection of privateMeshConnections.values()) {
      if (activeConnection.status !== "connected" || !activeConnection.transfer) {
        continue;
      }
      void activeConnection.transfer.notifyCatalogChanged().catch(() => undefined);
    }
  }

  async function readPrivateMeshFile(itemId: string): Promise<File> {
    const item = snapshot.items.find((candidate) => candidate.id === itemId);
    if (!item || item.kind === "app" || item.kind === "live-photo") {
      throw new Error("远程请求的文件不存在或暂不支持传输");
    }
    return await dependencies.store.getStoredFile(item.source);
  }

  async function readPrivateMeshThumbnail(itemId: string): Promise<Blob> {
    if (!dependencies.createPrivateMeshThumbnail) {
      throw new Error("当前设备未启用私有网络缩略图");
    }
    const item = snapshot.items.find((candidate) => candidate.id === itemId);
    const reference = item ? getPrivateMeshThumbnailSource(item) : null;
    if (!reference) throw new Error("远程请求的缩略图不存在");
    const source = await dependencies.store.getStoredFile(reference);
    return await dependencies.createPrivateMeshThumbnail(source);
  }

  async function refreshRuntimeCatalog(
    nodeId: string,
    run = generation,
    options: { announce?: boolean } = {},
  ): Promise<boolean> {
    const activeConnection = privateMeshConnections.get(nodeId);
    if (!activeConnection?.transfer || activeConnection.status !== "connected") {
      return false;
    }
    try {
      const entries = await activeConnection.transfer.requestCatalog();
      if (!belongsToCurrentRun(run)) return false;
      const state = privateMeshRecord.state;
      if (!state) return false;
      const receivedAt = dependencies.now?.() ?? new Date().toISOString();
      const record = replacePrivateMeshCatalogSnapshot(
        privateMeshCatalogRecord,
        {
          meshId: state.descriptor.meshId,
          nodeId,
          receivedAt,
          entries,
        },
      );
      const previous = privateMeshCatalogRecord;
      privateMeshCatalogRecord = record;
      installRuntimeCatalogRecord(record);
      await removeStalePrivateMeshThumbnails(previous, record);
      let cacheWarning = "";
      if (dependencies.privateMeshCatalogStore) {
        try {
          await dependencies.privateMeshCatalogStore.save(record);
        } catch {
          cacheWarning = "，但未能保存离线缓存";
        }
      }
      if (!belongsToCurrentRun(run)) return false;
      if (options.announce === false && !cacheWarning) {
        publishPrivateMeshRuntime();
      } else {
        publishPrivateMeshRuntime(
          `已读取远程设备的 ${entries.length} 个文件条目${cacheWarning}`,
        );
      }
      return true;
    } catch (error) {
      if (
        belongsToCurrentRun(run) &&
        privateMeshConnections.get(nodeId) === activeConnection
      ) {
        activeConnection.status = "error";
        activeConnection.message = errorMessage(error, "无法读取远程目录");
        publishPrivateMeshRuntime(activeConnection.message);
      }
      return false;
    }
  }

  async function activateRuntimeConnection(
    activeConnection: ActivePrivateMeshConnection,
    run: number,
  ): Promise<void> {
    const nodeId = activeConnection.connection.remoteNodeId;
    try {
      const channel = await waitForPrivateMeshChannel(activeConnection.connection);
      if (!belongsToCurrentRun(run)) {
        closeRuntimeConnection(nodeId);
        return;
      }
      activeConnection.transfer = createPrivateMeshTransferSession(channel, {
        listCatalog: () => Promise.resolve(localPrivateMeshCatalog()),
        readFile: readPrivateMeshFile,
        ...(dependencies.createPrivateMeshThumbnail
          ? { readThumbnail: readPrivateMeshThumbnail }
          : {}),
        acceptEpochUpdate: async (updateCode) => {
          await applyPrivateMeshEpochUpdate(updateCode, nodeId, run);
        },
        onCatalogChanged: () => {
          if (belongsToCurrentRun(run)) {
            privateMeshCatalogRefreshQueue.schedule(nodeId);
          }
        },
      });
      activeConnection.status = "connected";
      activeConnection.message = undefined;
      const disconnected = () => {
        if (!belongsToCurrentRun(run)) return;
        privateMeshCatalogRefreshQueue.cancel(nodeId);
        activeConnection.transfer?.dispose();
        activeConnection.transfer = undefined;
        activeConnection.status = "error";
        activeConnection.message = "设备连接已断开";
        publishPrivateMeshRuntime("设备连接已断开");
      };
      channel.addEventListener("close", disconnected, { once: true });
      channel.addEventListener("error", disconnected, { once: true });
      const pendingEpochUpdates = privateMeshRecord.state?.pendingEpochUpdates.filter(
        (update) => update.nodeId !== nodeId,
      );
      if (
        privateMeshRecord.state && pendingEpochUpdates &&
        pendingEpochUpdates.length !==
          privateMeshRecord.state.pendingEpochUpdates.length
      ) {
        await savePrivateMeshRecord({
          ...privateMeshRecord,
          state: { ...privateMeshRecord.state, pendingEpochUpdates },
        }, run);
        if (!belongsToCurrentRun(run)) return;
      }
      publishPrivateMeshRuntime("已建立端到端设备连接");
      await refreshRuntimeCatalog(nodeId, run);
    } catch (error) {
      if (!belongsToCurrentRun(run)) return;
      activeConnection.status = "error";
      activeConnection.message = errorMessage(error, "无法建立设备连接");
      publishPrivateMeshRuntime(activeConnection.message);
    }
  }

  function publish(patch: Partial<FileLibrarySessionSnapshot>): void {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener(snapshot);
  }

  localDirectorySource?.subscribe((localDirectory) => {
    if (active) publish({ localDirectory });
  });

  function belongsToCurrentRun(run: number): boolean {
    return active && run === generation;
  }

  function replaceItems(items: LibraryItem[]): void {
    const nextCatalogSignature = JSON.stringify(localPrivateMeshCatalog(items));
    const catalogChanged = nextCatalogSignature !==
      localPrivateMeshCatalogSignature;
    localPrivateMeshCatalogSignature = nextCatalogSignature;
    publish({ items });
    void localDirectorySource?.reconcile(items);
    startBackgroundWork();
    if (active && catalogChanged) broadcastLocalPrivateMeshCatalogChange();
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

  async function loadPrivateMesh(run = generation): Promise<void> {
    if (!dependencies.privateMeshStore) {
      if (belongsToCurrentRun(run)) {
        privateMeshCatalogRecord = null;
        remotePrivateMeshCatalogs.clear();
        publish({ privateMesh: currentPrivateMeshSnapshot() });
      }
      return;
    }
    try {
      privateMeshRecord = await dependencies.privateMeshStore.load();
      if (!belongsToCurrentRun(run)) return;
      let catalogWarning: string | null = null;
      if (privateMeshRecord.state && dependencies.privateMeshCatalogStore) {
        try {
          privateMeshCatalogRecord = await dependencies.privateMeshCatalogStore
            .load();
        } catch {
          privateMeshCatalogRecord = null;
          catalogWarning = "远程目录缓存已损坏，已忽略；本机文件与网络身份不受影响";
        }
      } else {
        privateMeshCatalogRecord = null;
      }
      const persistenceWarning = await retainCurrentPrivateMeshCatalog(run, true);
      if (!belongsToCurrentRun(run)) return;
      publish({
        privateMesh: currentPrivateMeshSnapshot(),
        ...((catalogWarning ?? persistenceWarning)
          ? { message: catalogWarning ?? persistenceWarning ?? "" }
          : {}),
      });
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({
          privateMesh: {
            status: "error",
            message: errorMessage(error, "无法打开私有网络身份"),
          },
        });
      }
    }
  }

  async function savePrivateMeshRecord(
    record: PrivateMeshLocalRecord,
    run: number,
  ): Promise<void> {
    if (!dependencies.privateMeshStore) {
      throw new Error("私有网络持久化不可用");
    }
    await dependencies.privateMeshStore.save(record);
    if (!belongsToCurrentRun(run)) return;
    privateMeshRecord = record;
    const catalogWarning = await retainCurrentPrivateMeshCatalog(run, true);
    if (!belongsToCurrentRun(run)) return;
    publish({
      privateMesh: currentPrivateMeshSnapshot(record),
      ...(catalogWarning ? { message: catalogWarning } : {}),
    });
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

  async function runAudioQueue(run: number): Promise<void> {
    let processed = false;
    while (belongsToCurrentRun(run)) {
      const item = snapshot.items.find((candidate) =>
        isPendingAudio(candidate) && !audioFailures.has(candidate.id)
      );
      if (!item) break;
      const controller = new AbortController();
      activeControllers.add(controller);
      try {
        const items = await dependencies.store.processAudio(item.id, controller.signal);
        if (!belongsToCurrentRun(run)) {
          controller.abort();
          return;
        }
        replaceItems(items);
        processed = true;
      } catch (error) {
        if (!belongsToCurrentRun(run)) return;
        audioFailures.add(item.id);
        publish({ message: errorMessage(error, "音频标签分析暂时失败") });
      } finally {
        activeControllers.delete(controller);
      }
    }
    if (processed) await refreshStorage(run);
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
      !audioRun &&
      snapshot.items.some((item) => isPendingAudio(item) && !audioFailures.has(item.id))
    ) {
      audioRun = runAudioQueue(run).finally(() => {
        audioRun = null;
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
    attemptedPrivateMeshThumbnails.clear();
    privateMeshThumbnailRequests.clear();
    publish({
      ...INITIAL_SNAPSHOT,
      localDirectory: localDirectorySource?.getSnapshot() ??
        INITIAL_SNAPSHOT.localDirectory,
    });
    try {
      const loadedItems = await dependencies.store.load();
      if (!belongsToCurrentRun(run)) return;
      const retry = await retryFailedFingerprintsOnStart(loadedItems, run);
      if (!belongsToCurrentRun(run)) return;
      const items = retry.items;
      localPrivateMeshCatalogSignature = JSON.stringify(
        localPrivateMeshCatalog(items),
      );
      const storedFileCount = items.filter((item) => item.kind !== "app").length;
      publish({
        items,
        message: retry.failed
          ? "部分文件指纹将在下次打开时重试"
          : storedFileCount > 0
          ? "导入内容仅保存在当前浏览器"
          : `${dependencies.defaultAppCount} 个默认 App 已就绪`,
      });
      await localDirectorySource?.restore();
      if (!belongsToCurrentRun(run)) return;
      await localDirectorySource?.reconcile(items);
      if (!belongsToCurrentRun(run)) return;
      startBackgroundWork();
      await refreshStorage(run);
      await refreshNativePhotoAvailability(run);
      await loadPrivateMesh(run);
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法打开 OPFS 文件库") });
      }
    }
  }

  function stop(): void {
    active = false;
    generation += 1;
    privateMeshRemoteFileImportController?.abort(
      PRIVATE_MESH_PRESERVE_ABORT_REASON,
    );
    for (const controller of activeControllers) controller.abort();
    activeControllers.clear();
    privateMeshCatalogRefreshQueue.clear();
    localDirectorySource?.stop();
    for (const nodeId of [...privateMeshConnections.keys()]) {
      closeRuntimeConnection(nodeId);
    }
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

  async function toggleLocalDirectory(): Promise<boolean> {
    if (
      !active || snapshot.busy || !localDirectorySource ||
      !snapshot.localDirectory.supported
    ) return false;
    if (snapshot.sourceMode === "directory") {
      publish({
        sourceMode: "opfs",
        message: "正在查看 OpenFX OPFS",
      });
      return true;
    }
    const connected = await localDirectorySource.connect();
    if (!active || !connected) return false;
    publish({
      sourceMode: "directory",
      message: `正在查看“${localDirectorySource.getSnapshot().directoryName}”`,
    });
    return true;
  }

  async function importLocalDirectoryEntry(id: string): Promise<boolean> {
    if (
      !active || snapshot.busy || snapshot.sourceMode !== "directory" ||
      !localDirectorySource
    ) return false;
    const entry = snapshot.localDirectory.entries.find((candidate) =>
      candidate.id === id
    );
    if (
      !entry || entry.importState === "imported" || entry.importState === "importing"
    ) {
      return false;
    }
    const itemIdsBeforeImport = new Set(snapshot.items.map((item) => item.id));
    await localDirectorySource.markImporting(id);
    try {
      const file = await localDirectorySource.getFile(id);
      const imported = await importFiles([file]);
      if (!imported || !active) {
        await localDirectorySource.markFailed(id, "没有完成导入");
        return false;
      }
      const item = snapshot.items.find((candidate) =>
        !itemIdsBeforeImport.has(candidate.id) &&
        candidate.source.name === file.name &&
        candidate.source.size === file.size &&
        candidate.source.lastModified === file.lastModified
      ) ?? snapshot.items.find((candidate) =>
        candidate.source.name === file.name &&
        candidate.source.size === file.size &&
        candidate.source.lastModified === file.lastModified
      );
      if (!item) {
        await localDirectorySource.markFailed(id, "文件已复制，但无法确认 OPFS 条目");
        return false;
      }
      await localDirectorySource.markImported(id, item.id);
      publish({ message: `已将“${entry.name}”复制到 OPFS` });
      return true;
    } catch (error) {
      await localDirectorySource.markFailed(
        id,
        errorMessage(error, "无法读取本地文件"),
      );
      publish({ message: errorMessage(error, "无法导入本地文件") });
      return false;
    }
  }

  async function getLocalDirectoryFile(id: string): Promise<File> {
    if (!localDirectorySource) throw new Error("当前环境不支持本地文件夹");
    return await localDirectorySource.getFile(id);
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

  async function createPrivateNetwork(input: {
    meshName: string;
    nodeName: string;
    recoveryPassphrase: string;
    now?: string;
  }): Promise<{ recoveryCode: string } | null> {
    if (!active || privateMeshRecord.state) return null;
    const run = generation;
    try {
      const created = await createPrivateMesh(input, privateMeshKeyVault);
      await savePrivateMeshRecord({
        version: 2,
        state: created.state,
        pendingPairing: null,
      }, run);
      if (!belongsToCurrentRun(run)) return null;
      publish({ message: "私有网络已创建，请妥善保存恢复码" });
      return { recoveryCode: created.recoveryCode };
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法创建私有网络") });
      }
      return null;
    }
  }

  async function beginPrivateMeshPairing(input: {
    nodeName: string;
    now?: string;
  }): Promise<{ requestCode: string; verificationCode: string } | null> {
    if (!active || privateMeshRecord.state) return null;
    const run = generation;
    try {
      const pendingPairing = await createPairingRequest(
        input,
        privateMeshKeyVault,
      );
      await savePrivateMeshRecord({
        version: 2,
        state: null,
        pendingPairing,
      }, run);
      if (!belongsToCurrentRun(run)) return null;
      publish({ message: "配对请求已生成，请交给已有设备批准" });
      return {
        requestCode: pendingPairing.requestCode,
        verificationCode: pendingPairing.verificationCode,
      };
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法生成配对请求") });
      }
      return null;
    }
  }

  async function approvePrivateMeshPairing(
    requestCode: string,
    options: { now?: string } = {},
  ): Promise<{ approvalCode: string; verificationCode: string } | null> {
    if (!active || !privateMeshRecord.state) return null;
    const run = generation;
    try {
      const approved = await approvePairingRequest(
        privateMeshRecord.state,
        requestCode,
        privateMeshKeyVault,
        options,
      );
      await savePrivateMeshRecord({
        ...privateMeshRecord,
        state: approved.state,
      }, run);
      if (!belongsToCurrentRun(run)) return null;
      publish({ message: "新设备已获准加入私有网络" });
      return {
        approvalCode: approved.approvalCode,
        verificationCode: approved.verificationCode,
      };
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法批准配对请求") });
      }
      return null;
    }
  }

  async function acceptPrivateMeshPairing(
    approvalCode: string,
  ): Promise<boolean> {
    if (
      !active || privateMeshRecord.state || !privateMeshRecord.pendingPairing
    ) return false;
    const run = generation;
    try {
      const state = await acceptPairingApproval(
        privateMeshRecord.pendingPairing,
        approvalCode,
        privateMeshKeyVault,
      );
      await savePrivateMeshRecord({
        version: 2,
        state,
        pendingPairing: null,
      }, run);
      if (!belongsToCurrentRun(run)) return false;
      publish({ message: `已加入“${state.descriptor.name}”` });
      return true;
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法完成设备配对") });
      }
      return false;
    }
  }

  async function revokePrivateMeshMember(
    nodeId: string,
    options: { now?: string } = {},
  ): Promise<boolean> {
    if (!active || !privateMeshRecord.state) return false;
    const run = generation;
    try {
      const state = await revokePrivateMeshMemberState(
        privateMeshRecord.state,
        nodeId,
        privateMeshKeyVault,
        options,
      );
      await savePrivateMeshRecord({
        ...privateMeshRecord,
        state,
      }, run);
      if (!belongsToCurrentRun(run)) return false;
      closeRuntimeConnection(nodeId);
      const delivered = new Set<string>();
      await Promise.all(state.pendingEpochUpdates.map(async (update) => {
        const connection = privateMeshConnections.get(update.nodeId);
        if (!connection?.transfer || connection.status !== "connected") return;
        try {
          await connection.transfer.sendEpochUpdate(update.updateCode);
          delivered.add(update.nodeId);
        } catch {
          // Keep the encrypted update code for manual delivery or a later connection.
        }
      }));
      if (!belongsToCurrentRun(run)) return false;
      const pendingEpochUpdates = state.pendingEpochUpdates.filter((update) =>
        !delivered.has(update.nodeId)
      );
      if (pendingEpochUpdates.length !== state.pendingEpochUpdates.length) {
        await savePrivateMeshRecord({
          ...privateMeshRecord,
          state: { ...state, pendingEpochUpdates },
        }, run);
        if (!belongsToCurrentRun(run)) return false;
      }
      const deliveredText = delivered.size > 0
        ? `，${delivered.size} 台已在线更新`
        : "";
      const pendingText = pendingEpochUpdates.length > 0
        ? `，${pendingEpochUpdates.length} 台等待手工更新`
        : "";
      publishPrivateMeshRuntime(
        `设备已撤销，网络密钥已轮换至第 ${state.descriptor.epoch} 代${deliveredText}${pendingText}`,
      );
      return true;
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法撤销成员设备") });
      }
      return false;
    }
  }

  async function applyPrivateMeshEpochUpdate(
    updateCode: string,
    sourceNodeId: string | undefined,
    run: number,
  ): Promise<void> {
    if (!privateMeshRecord.state) throw new Error("当前设备尚未加入私有网络");
    const state = await acceptPrivateMeshEpochUpdateState(
      privateMeshRecord.state,
      updateCode,
      privateMeshKeyVault,
    );
    await savePrivateMeshRecord({
      ...privateMeshRecord,
      state,
    }, run);
    if (!belongsToCurrentRun(run)) return;
    const memberIds = new Set(state.members.map((member) => member.payload.nodeId));
    for (const nodeId of [...privateMeshConnections.keys()]) {
      if (!memberIds.has(nodeId) || nodeId !== sourceNodeId) {
        closeRuntimeConnection(nodeId);
      }
    }
    publishPrivateMeshRuntime(
      `网络密钥已更新至第 ${state.descriptor.epoch} 代`,
    );
  }

  async function acceptPrivateMeshEpochUpdate(
    updateCode: string,
  ): Promise<boolean> {
    if (!active || !privateMeshRecord.state) return false;
    const run = generation;
    try {
      await applyPrivateMeshEpochUpdate(updateCode, undefined, run);
      return belongsToCurrentRun(run);
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法更新私有网络密钥") });
      }
      return false;
    }
  }

  async function createPrivateMeshTransportOffer(
    recipientNodeId: string,
    options: { usePublicStun?: boolean } = {},
  ): Promise<{ offerCode: string } | null> {
    if (!active || !privateMeshRecord.state) return null;
    const run = generation;
    try {
      closeRuntimeConnection(recipientNodeId);
      const offered = await createPrivateMeshConnectionOffer(
        privateMeshRecord.state,
        recipientNodeId,
        privateMeshKeyVault,
        {
          createPeerConnection: dependencies.createPeerConnection,
          usePublicStun: options.usePublicStun,
        },
      );
      if (!belongsToCurrentRun(run)) {
        closePrivateMeshConnection(offered.connection);
        return null;
      }
      privateMeshConnections.set(recipientNodeId, {
        connection: offered.connection,
        status: "connecting",
      });
      publishPrivateMeshRuntime("连接 offer 已生成，请交给目标设备");
      return { offerCode: offered.offerCode };
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法创建设备连接 offer") });
      }
      return null;
    }
  }

  async function acceptPrivateMeshTransportOffer(
    offerCode: string,
    options: { usePublicStun?: boolean } = {},
  ): Promise<{ answerCode: string; remoteNodeId: string } | null> {
    if (!active || !privateMeshRecord.state) return null;
    const run = generation;
    try {
      const accepted = await acceptPrivateMeshConnectionOffer(
        privateMeshRecord.state,
        offerCode,
        privateMeshKeyVault,
        {
          createPeerConnection: dependencies.createPeerConnection,
          usePublicStun: options.usePublicStun,
        },
      );
      if (!belongsToCurrentRun(run)) {
        closePrivateMeshConnection(accepted.connection);
        return null;
      }
      closeRuntimeConnection(accepted.connection.remoteNodeId);
      const activeConnection: ActivePrivateMeshConnection = {
        connection: accepted.connection,
        status: "connecting",
      };
      privateMeshConnections.set(
        accepted.connection.remoteNodeId,
        activeConnection,
      );
      publishPrivateMeshRuntime("连接 answer 已生成，请交回发起设备");
      void activateRuntimeConnection(activeConnection, run);
      return {
        answerCode: accepted.answerCode,
        remoteNodeId: accepted.connection.remoteNodeId,
      };
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({ message: errorMessage(error, "无法接受设备连接 offer") });
      }
      return null;
    }
  }

  async function completePrivateMeshTransportOffer(
    remoteNodeId: string,
    answerCode: string,
  ): Promise<boolean> {
    if (!active || !privateMeshRecord.state) return false;
    const activeConnection = privateMeshConnections.get(remoteNodeId);
    if (!activeConnection) return false;
    const run = generation;
    try {
      await completePrivateMeshConnectionOffer(
        privateMeshRecord.state,
        activeConnection.connection,
        answerCode,
      );
      if (!belongsToCurrentRun(run)) return false;
      await activateRuntimeConnection(activeConnection, run);
      return activeConnection.status === "connected";
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        activeConnection.status = "error";
        activeConnection.message = errorMessage(error, "无法完成设备连接");
        publishPrivateMeshRuntime(activeConnection.message);
      }
      return false;
    }
  }

  async function refreshPrivateMeshRemoteCatalog(
    remoteNodeId: string,
  ): Promise<boolean> {
    if (!active) return false;
    return await refreshRuntimeCatalog(remoteNodeId);
  }

  function privateMeshThumbnailCacheKey(
    remoteNodeId: string,
    itemId: string,
  ): PrivateMeshThumbnailCacheKey | null {
    const state = privateMeshRecord.state;
    const entry = remotePrivateMeshCatalogs.get(remoteNodeId)?.entries.find(
      (candidate) => candidate.itemId === itemId,
    );
    if (!state || !entry?.thumbnail) return null;
    return {
      meshId: state.descriptor.meshId,
      nodeId: remoteNodeId,
      itemId,
      revision: entry.thumbnail.revision,
    };
  }

  async function getPrivateMeshRemoteThumbnail(
    remoteNodeId: string,
    itemId: string,
  ): Promise<Blob | null> {
    const store = dependencies.privateMeshThumbnailStore;
    if (!active || !store) return null;
    const key = privateMeshThumbnailCacheKey(remoteNodeId, itemId);
    if (!key) return null;
    try {
      const cached = await store.load(key);
      if (cached) return cached;
    } catch {
      await store.remove(key).catch(() => undefined);
    }
    const requestKey = JSON.stringify(key);
    const pending = privateMeshThumbnailRequests.get(requestKey);
    if (pending) return await pending;
    const activeConnection = privateMeshConnections.get(remoteNodeId);
    if (
      attemptedPrivateMeshThumbnails.has(requestKey) ||
      attemptedPrivateMeshThumbnails.size >=
        MAX_PRIVATE_MESH_REMOTE_THUMBNAIL_REQUESTS ||
      !activeConnection?.transfer || activeConnection.status !== "connected"
    ) return null;

    attemptedPrivateMeshThumbnails.add(requestKey);
    const run = generation;
    const request = (async (): Promise<Blob | null> => {
      try {
        const thumbnail = await activeConnection.transfer!.requestThumbnail(itemId);
        if (
          !belongsToCurrentRun(run) ||
          JSON.stringify(privateMeshThumbnailCacheKey(remoteNodeId, itemId)) !==
            requestKey
        ) return null;
        await store.save(key, thumbnail).catch(() => undefined);
        return thumbnail;
      } catch {
        return null;
      } finally {
        privateMeshThumbnailRequests.delete(requestKey);
      }
    })();
    privateMeshThumbnailRequests.set(requestKey, request);
    return await request;
  }

  async function importPrivateMeshRemoteFile(
    remoteNodeId: string,
    itemId: string,
  ): Promise<boolean> {
    if (!active || snapshot.busy) return false;
    const activeConnection = privateMeshConnections.get(remoteNodeId);
    if (!activeConnection?.transfer || activeConnection.status !== "connected") {
      return false;
    }
    const run = generation;
    const controller = new AbortController();
    privateMeshRemoteFileImportController = controller;
    activeControllers.add(controller);
    publish({ busy: true, message: "正在从远程设备读取原件…" });
    try {
      const remoteFile = snapshot.privateMesh.status === "ready"
        ? snapshot.privateMesh.remoteFiles.find((candidate) =>
          candidate.nodeId === remoteNodeId && candidate.itemId === itemId
        )
        : undefined;
      let importedName: string;
      let items: LibraryItem[];
      if (
        dependencies.store.createPrivateMeshRemoteFileSink &&
        getFileExtension(remoteFile?.name ?? "") !== "livp" &&
        snapshot.privateMesh.status === "ready"
      ) {
        const metadata = await activeConnection.transfer.requestFileToSink(
          itemId,
          dependencies.store.createPrivateMeshRemoteFileSink({
            meshId: snapshot.privateMesh.meshId,
            nodeId: remoteNodeId,
            itemId,
          }),
          { signal: controller.signal },
        );
        importedName = metadata.name;
        items = await dependencies.store.load();
      } else {
        const source = await activeConnection.transfer.requestFile(itemId, {
          signal: controller.signal,
        });
        importedName = source.name;
        items = await dependencies.store.importFiles([source]);
      }
      if (!belongsToCurrentRun(run)) return false;
      replaceItems(items);
      publish({ message: `已从远程设备导入“${importedName}”` });
      await refreshStorage(run);
      return true;
    } catch (error) {
      if (belongsToCurrentRun(run)) {
        publish({
          message: controller.signal.aborted
            ? "已取消读取远程文件"
            : errorMessage(error, "无法读取远程文件"),
        });
      }
      return false;
    } finally {
      activeControllers.delete(controller);
      if (privateMeshRemoteFileImportController === controller) {
        privateMeshRemoteFileImportController = null;
      }
      if (belongsToCurrentRun(run)) publish({ busy: false });
    }
  }

  function cancelPrivateMeshRemoteFileImport(): boolean {
    if (!privateMeshRemoteFileImportController) return false;
    privateMeshRemoteFileImportController.abort();
    return true;
  }

  async function whenIdle(): Promise<void> {
    while (photoRun || audioRun || fingerprintRun || thumbnailRun) {
      await Promise.all([
        photoRun ?? Promise.resolve(),
        audioRun ?? Promise.resolve(),
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
    toggleLocalDirectory,
    importLocalDirectoryEntry,
    getLocalDirectoryFile,
    importFromPhotos,
    removeItem,
    setFavorite,
    updateItemDetails,
    recordPlayback,
    persistStorage,
    createPrivateNetwork,
    beginPrivateMeshPairing,
    approvePrivateMeshPairing,
    acceptPrivateMeshPairing,
    revokePrivateMeshMember,
    acceptPrivateMeshEpochUpdate,
    createPrivateMeshTransportOffer,
    acceptPrivateMeshTransportOffer,
    completePrivateMeshTransportOffer,
    refreshPrivateMeshRemoteCatalog,
    getPrivateMeshRemoteThumbnail,
    importPrivateMeshRemoteFile,
    cancelPrivateMeshRemoteFileImport,
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
