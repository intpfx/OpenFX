import { classifyFile, type LibraryItem, type LibraryItemKind } from "./model.ts";

export type LocalDirectoryCapabilityRuntime = Readonly<{
  isSecureContext?: boolean;
  showDirectoryPicker?: unknown;
}>;

export type LocalDirectoryFileHandle = Readonly<{
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
}>;

export type LocalDirectoryFolderHandle = Readonly<{
  kind: "directory";
  name: string;
  values: () => AsyncIterable<LocalDirectoryHandle>;
  queryPermission?: (descriptor: { mode: "read" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "read" }) => Promise<PermissionState>;
}>;

export type LocalDirectoryHandle =
  | LocalDirectoryFileHandle
  | LocalDirectoryFolderHandle;

export type LocalDirectoryImportState =
  | "available"
  | "importing"
  | "imported"
  | "failed";

export type LocalDirectoryEntrySnapshot = Readonly<{
  id: string;
  name: string;
  relativePath: string;
  kind: Exclude<LibraryItemKind, "app" | "live-photo" | "link">;
  type: string;
  size: number;
  lastModified: number;
  importState: LocalDirectoryImportState;
  error?: string;
}>;

export type LocalDirectorySourceSnapshot = Readonly<{
  supported: boolean;
  status:
    | "unsupported"
    | "disconnected"
    | "permission-required"
    | "scanning"
    | "ready"
    | "error";
  directoryName: string | null;
  entries: readonly LocalDirectoryEntrySnapshot[];
  message?: string;
}>;

type LocalDirectoryImportReceipt = Readonly<{
  itemId: string;
  size: number;
  lastModified: number;
}>;

export type LocalDirectoryStoredState = Readonly<{
  sourceId: string;
  handle: LocalDirectoryFolderHandle;
  receipts: Readonly<Record<string, LocalDirectoryImportReceipt>>;
}>;

export type LocalDirectorySourceStore = Readonly<{
  load: () => Promise<LocalDirectoryStoredState | null>;
  save: (state: LocalDirectoryStoredState) => Promise<void>;
}>;

export type LocalDirectorySource = ReturnType<typeof createLocalDirectorySource>;

export function supportsLocalDirectorySource(
  runtime: LocalDirectoryCapabilityRuntime,
): boolean {
  return runtime.isSecureContext === true &&
    typeof runtime.showDirectoryPicker === "function";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isDirectoryHandle(value: unknown): value is LocalDirectoryFolderHandle {
  return Boolean(
    value && typeof value === "object" &&
      (value as { kind?: unknown }).kind === "directory" &&
      typeof (value as { name?: unknown }).name === "string" &&
      typeof (value as { values?: unknown }).values === "function",
  );
}

function emptySnapshot(supported: boolean): LocalDirectorySourceSnapshot {
  return {
    supported,
    status: supported ? "disconnected" : "unsupported",
    directoryName: null,
    entries: [],
  };
}

export function createLocalDirectorySource(options: {
  runtime: LocalDirectoryCapabilityRuntime;
  store: LocalDirectorySourceStore;
}) {
  const supported = supportsLocalDirectorySource(options.runtime);
  const listeners = new Set<(snapshot: LocalDirectorySourceSnapshot) => void>();
  const fileHandles = new Map<string, LocalDirectoryFileHandle>();
  let snapshot = emptySnapshot(supported);
  let selected: LocalDirectoryStoredState | null = null;
  let scanGeneration = 0;

  const publish = (patch: Partial<LocalDirectorySourceSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener(snapshot);
  };

  const permission = async (
    handle: LocalDirectoryFolderHandle,
    request: boolean,
  ): Promise<PermissionState> => {
    const descriptor = { mode: "read" as const };
    const current = handle.queryPermission
      ? await handle.queryPermission(descriptor)
      : "granted";
    if (current !== "prompt" || !request || !handle.requestPermission) {
      return current;
    }
    return await handle.requestPermission(descriptor);
  };

  const scan = async (handle: LocalDirectoryFolderHandle): Promise<boolean> => {
    const currentGeneration = ++scanGeneration;
    fileHandles.clear();
    publish({
      status: "scanning",
      directoryName: handle.name,
      entries: [],
      message: `正在读取“${handle.name}”…`,
    });
    const entries: LocalDirectoryEntrySnapshot[] = [];

    const visit = async (
      folder: LocalDirectoryFolderHandle,
      parentPath: string,
    ): Promise<void> => {
      for await (const child of folder.values()) {
        if (currentGeneration !== scanGeneration) return;
        const relativePath = parentPath ? `${parentPath}/${child.name}` : child.name;
        if (child.kind === "directory") {
          await visit(child, relativePath);
          continue;
        }
        const file = await child.getFile();
        fileHandles.set(relativePath, child);
        const receipt = selected?.receipts[relativePath];
        entries.push({
          id: relativePath,
          name: file.name,
          relativePath,
          kind: classifyFile(file),
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
          importState: receipt && receipt.size === file.size &&
              receipt.lastModified === file.lastModified
            ? "imported"
            : "available",
        });
      }
    };

    try {
      await visit(handle, "");
      if (currentGeneration !== scanGeneration) return false;
      entries.sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath, "zh-CN")
      );
      publish({
        status: "ready",
        entries,
        message: `${handle.name} · ${entries.length} 项`,
      });
      return true;
    } catch (error) {
      if (currentGeneration !== scanGeneration) return false;
      publish({
        status: "error",
        entries: [],
        message: errorMessage(error, "无法读取所选文件夹"),
      });
      return false;
    }
  };

  const chooseDirectory = async (): Promise<LocalDirectoryFolderHandle | null> => {
    const picker = options.runtime.showDirectoryPicker;
    if (typeof picker !== "function") return null;
    const picked = await picker({ mode: "read", id: "openfx-library-source" });
    if (!isDirectoryHandle(picked)) throw new Error("没有获得可读取的文件夹");
    return picked;
  };

  async function restore(): Promise<void> {
    if (!supported) return;
    try {
      selected = await options.store.load();
      if (!selected) return;
      const currentPermission = await permission(selected.handle, false);
      publish({
        status: currentPermission === "granted"
          ? "disconnected"
          : "permission-required",
        directoryName: selected.handle.name,
        entries: [],
        message: currentPermission === "granted"
          ? `已记住“${selected.handle.name}”`
          : `需要重新授权“${selected.handle.name}”`,
      });
    } catch (error) {
      publish({
        status: "error",
        message: errorMessage(error, "无法恢复本地文件夹"),
      });
    }
  }

  async function connect(): Promise<boolean> {
    if (!supported) return false;
    try {
      let handle = selected?.handle ?? null;
      if (handle) {
        const currentPermission = await permission(handle, true);
        if (currentPermission !== "granted") handle = null;
      }
      if (!handle) {
        handle = await chooseDirectory();
        if (!handle) return false;
        selected = {
          sourceId: crypto.randomUUID(),
          handle,
          receipts: {},
        };
        await options.store.save(selected);
      }
      return await scan(handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        publish({ message: "已取消选择文件夹" });
        return false;
      }
      publish({
        status: "error",
        message: errorMessage(error, "无法连接本地文件夹"),
      });
      return false;
    }
  }

  async function getFile(id: string): Promise<File> {
    const handle = fileHandles.get(id);
    if (!handle) throw new Error("本地文件已移动或不再可用");
    return await handle.getFile();
  }

  async function setImportState(
    id: string,
    importState: LocalDirectoryImportState,
    error?: string,
  ): Promise<void> {
    publish({
      entries: snapshot.entries.map((entry) =>
        entry.id === id ? { ...entry, importState, error } : entry
      ),
    });
  }

  async function markImported(id: string, itemId: string): Promise<void> {
    const entry = snapshot.entries.find((candidate) => candidate.id === id);
    if (!entry || !selected) return;
    selected = {
      ...selected,
      receipts: {
        ...selected.receipts,
        [id]: {
          itemId,
          size: entry.size,
          lastModified: entry.lastModified,
        },
      },
    };
    await options.store.save(selected);
    await setImportState(id, "imported");
  }

  async function reconcile(items: readonly LibraryItem[]): Promise<void> {
    if (!selected) return;
    const itemIds = new Set(items.map((item) => item.id));
    const receipts = Object.fromEntries(
      Object.entries(selected.receipts).filter(([, receipt]) =>
        itemIds.has(receipt.itemId)
      ),
    );
    if (Object.keys(receipts).length !== Object.keys(selected.receipts).length) {
      selected = { ...selected, receipts };
      await options.store.save(selected);
    }
    publish({
      entries: snapshot.entries.map((entry) => {
        const receipt = receipts[entry.id];
        return {
          ...entry,
          importState: receipt && receipt.size === entry.size &&
              receipt.lastModified === entry.lastModified
            ? "imported"
            : entry.importState === "importing"
            ? "importing"
            : "available",
        };
      }),
    });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: (snapshot: LocalDirectorySourceSnapshot) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    restore,
    connect,
    getFile,
    markImporting: (id: string) => setImportState(id, "importing"),
    markImported,
    markFailed: (id: string, error: string) => setImportState(id, "failed", error),
    reconcile,
    stop() {
      scanGeneration += 1;
      fileHandles.clear();
    },
  };
}

const LOCAL_DIRECTORY_DATABASE = "openfx-local-directory-source";
const LOCAL_DIRECTORY_STORE = "selected-directory";
const LOCAL_DIRECTORY_KEY = "active";

function openLocalDirectoryDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DIRECTORY_DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOCAL_DIRECTORY_STORE)) {
        database.createObjectStore(LOCAL_DIRECTORY_STORE);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("无法打开目录句柄库"));
    request.onsuccess = () => resolve(request.result);
  });
}

async function readStoredLocalDirectory(): Promise<LocalDirectoryStoredState | null> {
  const database = await openLocalDirectoryDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(LOCAL_DIRECTORY_STORE, "readonly");
      const request = transaction.objectStore(LOCAL_DIRECTORY_STORE).get(
        LOCAL_DIRECTORY_KEY,
      );
      request.onerror = () => reject(request.error ?? new Error("无法读取目录句柄"));
      request.onsuccess = () =>
        resolve((request.result as LocalDirectoryStoredState | undefined) ?? null);
    });
  } finally {
    database.close();
  }
}

async function writeStoredLocalDirectory(
  state: LocalDirectoryStoredState,
): Promise<void> {
  const database = await openLocalDirectoryDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LOCAL_DIRECTORY_STORE, "readwrite");
      transaction.objectStore(LOCAL_DIRECTORY_STORE).put(state, LOCAL_DIRECTORY_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("无法保存目录句柄"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("目录句柄保存已中止"));
    });
  } finally {
    database.close();
  }
}

export function createIndexedDbLocalDirectorySourceStore(): LocalDirectorySourceStore {
  let memoryState: LocalDirectoryStoredState | null = null;
  return {
    async load() {
      if (typeof indexedDB === "undefined") return memoryState;
      try {
        memoryState = await readStoredLocalDirectory();
      } catch {
        // A blocked IndexedDB may reduce persistence but must not disable this session.
      }
      return memoryState;
    },
    async save(state) {
      memoryState = state;
      if (typeof indexedDB === "undefined") return;
      try {
        await writeStoredLocalDirectory(state);
      } catch {
        // Keep the handle in memory so the active session remains usable.
      }
    },
  };
}

export function createBrowserLocalDirectorySource(): LocalDirectorySource {
  const runtime = globalThis as typeof globalThis & {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
    }) => Promise<unknown>;
  };
  return createLocalDirectorySource({
    runtime: {
      isSecureContext: runtime.isSecureContext,
      showDirectoryPicker: runtime.showDirectoryPicker?.bind(runtime),
    },
    store: createIndexedDbLocalDirectorySourceStore(),
  });
}
