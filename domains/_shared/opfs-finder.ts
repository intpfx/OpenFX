/**
 * OpfsFinder — OPFS file browser Web Component
 *
 * Extracted from the SGR framework (core/opfsFinder.js).
 * Refactored to TypeScript with pure functional data layer.
 *
 * Provides a file browser UI over the Origin Private File System (OPFS),
 * with versioned file storage, restore, and a plugin-based preview system.
 *
 * @module
 * @browser — requires `navigator.storage.getDirectory()`
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  version: number;
  timestamp: number;
  size: number;
}

export interface FilePlugin {
  name: string;
  extension: string;
  preview(file: File): HTMLElement;
}

interface WriteCommand {
  type: "write";
  name: string;
  sab: SharedArrayBuffer;
}

interface ReadCommand {
  type: "read";
  name: string;
  version: number;
  sab: SharedArrayBuffer;
}

interface ListCommand {
  type: "list";
}

interface DeleteCommand {
  type: "delete";
  name: string;
  version?: number;
}

interface RestoreCommand {
  type: "restore";
  name: string;
  version: number;
}

type OPFSWorkerCommand =
  | WriteCommand
  | ReadCommand
  | ListCommand
  | DeleteCommand
  | RestoreCommand;

type Manifest = Record<string, ManifestEntry[]>;

interface ManifestEntry {
  version: number;
  timestamp: number;
  size: number;
}

interface WorkerResponse {
  type: string;
  name?: string;
  version?: number;
  size?: number;
  files?: FileEntry[];
  message?: string;
}

// ─── Pure data helpers ────────────────────────────────────────────────

const versionedName = (name: string, timestamp: number): string =>
  `${name}#${timestamp}`;

const latestEntry = (entries: ManifestEntry[]): ManifestEntry | undefined =>
  entries.length > 0 ? entries[entries.length - 1] : undefined;

const fileToEntry = (name: string, entries: ManifestEntry[]): FileEntry => {
  const latest = latestEntry(entries)!;
  return {
    name,
    version: latest.version,
    timestamp: latest.timestamp,
    size: latest.size,
  };
};

const allFileEntries = (manifest: Manifest): FileEntry[] =>
  Object.entries(manifest)
    .filter(([, entries]) => entries.length > 0)
    .map(([name, entries]) => fileToEntry(name, entries));

// ─── Worker code (serialized) ─────────────────────────────────────────

const WORKER_SOURCE = `
let opfsRootHandle = null;
let manifest = {};

async function initOPFS() {
  if (!opfsRootHandle) {
    opfsRootHandle = await navigator.storage.getDirectory();
    try {
      const manifestHandle = await opfsRootHandle.getFileHandle('manifest.json');
      const file = await manifestHandle.getFile();
      manifest = JSON.parse(await file.text());
    } catch {
      const manifestHandle = await opfsRootHandle.getFileHandle('manifest.json', { create: true });
      const writable = await manifestHandle.createWritable();
      await writable.write(JSON.stringify({}));
      await writable.close();
      manifest = {};
    }
  }
}

async function saveManifest() {
  const manifestHandle = await opfsRootHandle.getFileHandle('manifest.json', { create: true });
  const writable = await manifestHandle.createWritable();
  await writable.write(JSON.stringify(manifest));
  await writable.close();
}

self.onmessage = async (event) => {
  await initOPFS();
  const cmd = event.data;
  switch (cmd.type) {
    case 'write': {
      const { name, sab } = cmd;
      const data = new Uint8Array(sab);
      const timestamp = Date.now();
      const version = (manifest[name]?.length || 0) + 1;
      const vName = name + '#' + timestamp;
      const fileHandle = await opfsRootHandle.getFileHandle(vName, { create: true });
      const accessHandle = await fileHandle.createSyncAccessHandle();
      accessHandle.write(data, { at: 0 });
      accessHandle.flush();
      accessHandle.close();
      manifest[name] = manifest[name] || [];
      manifest[name].push({ version, timestamp, size: data.length });
      await saveManifest();
      postMessage({ type: 'writeComplete', name, version });
      break;
    }
    case 'read': {
      const { name, version, sab } = cmd;
      const versionList = manifest[name] || [];
      const entry = versionList.find(v => v.version === version) || versionList[versionList.length - 1];
      if (entry) {
        const vName = name + '#' + entry.timestamp;
        const fileHandle = await opfsRootHandle.getFileHandle(vName);
        const accessHandle = await fileHandle.createSyncAccessHandle();
        const size = accessHandle.getSize();
        const dataView = new Uint8Array(sab);
        accessHandle.read(dataView, { at: 0 });
        accessHandle.close();
        postMessage({ type: 'readComplete', name, version, size });
      } else {
        postMessage({ type: 'error', message: '文件版本不存在' });
      }
      break;
    }
    case 'list': {
      const fileList = Object.keys(manifest).map(name => {
        const versions = manifest[name];
        const latest = versions[versions.length - 1];
        return { name, version: latest.version, timestamp: latest.timestamp, size: latest.size };
      });
      postMessage({ type: 'fileList', files: fileList });
      break;
    }
    case 'delete': {
      const { name, version } = cmd;
      if (manifest[name]) {
        if (version == null) {
          for (const entry of manifest[name]) {
            await opfsRootHandle.removeEntry(name + '#' + entry.timestamp);
          }
          delete manifest[name];
        } else {
          const idx = manifest[name].findIndex(v => v.version === version);
          if (idx > -1) {
            const entry = manifest[name][idx];
            await opfsRootHandle.removeEntry(name + '#' + entry.timestamp);
            manifest[name].splice(idx, 1);
            if (manifest[name].length === 0) delete manifest[name];
          }
        }
        await saveManifest();
        postMessage({ type: 'deleteComplete', name, version });
      } else {
        postMessage({ type: 'error', message: '文件不存在' });
      }
      break;
    }
    case 'restore': {
      const { name, version } = cmd;
      if (manifest[name]) {
        const entry = manifest[name].find(v => v.version === version);
        if (entry) {
          const vName = name + '#' + entry.timestamp;
          const fileHandle = await opfsRootHandle.getFileHandle(vName);
          const accessHandle = await fileHandle.createSyncAccessHandle();
          const size = accessHandle.getSize();
          const buffer = new Uint8Array(size);
          accessHandle.read(buffer, { at: 0 });
          accessHandle.close();
          const newTimestamp = Date.now();
          const newVersion = manifest[name].length + 1;
          const newVName = name + '#' + newTimestamp;
          const newFileHandle = await opfsRootHandle.getFileHandle(newVName, { create: true });
          const newAccess = await newFileHandle.createSyncAccessHandle();
          newAccess.write(buffer, { at: 0 });
          newAccess.flush();
          newAccess.close();
          manifest[name].push({ version: newVersion, timestamp: newTimestamp, size });
          await saveManifest();
          postMessage({ type: 'restoreComplete', name, version: newVersion });
        } else {
          postMessage({ type: 'error', message: '版本不存在' });
        }
      } else {
        postMessage({ type: 'error', message: '文件不存在' });
      }
      break;
    }
    default:
      console.error('未知命令：', cmd);
  }
};
`;

// ─── Image preview helpers (pure) ─────────────────────────────────────

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
]);

const isImage = (ext: string): boolean => IMAGE_EXTENSIONS.has(ext);

const formatSize = (bytes: number): string => `${Math.round(bytes / 1024)} KB`;

// ─── Web Component ────────────────────────────────────────────────────

const STYLES = `
  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 12px;
    padding: 10px;
  }
  .file-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 8px;
    background: #fafafa;
  }
  .file-item img {
    max-width: 80px;
    max-height: 80px;
    border-radius: 4px;
    object-fit: cover;
  }
  .file-info {
    font-size: 0.8em;
    text-align: center;
    margin-top: 4px;
  }
`;

export class OpfsFinder extends HTMLElement {
  static plugins: FilePlugin[] = [];

  private worker: Worker;
  private files: FileEntry[] = [];
  private callbacks: Map<string, (resp: WorkerResponse) => void> = new Map();
  private nextMessageId = 1;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.shadowRoot!.innerHTML = `
      <style>${STYLES}</style>
      <div class="file-grid" id="fileGrid"></div>
    `;

    // Spawn the OPFS worker
    const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    this.worker = new Worker(blobUrl, { type: "module" });
    this.worker.onmessage = this.onWorkerMessage.bind(this);
  }

  connectedCallback(): void {
    this.refreshFileList();
  }

  // ─── Worker communication ───────────────────────────

  private onWorkerMessage(event: MessageEvent<WorkerResponse>): void {
    const msg = event.data;

    switch (msg.type) {
      case "fileList":
        this.files = msg.files ?? [];
        this.renderUI();
        break;
      case "writeComplete":
      case "deleteComplete":
      case "restoreComplete":
      case "readComplete": {
        const cb = this.callbacks.get(msg.type);
        if (cb) {
          cb(msg);
          this.callbacks.delete(msg.type);
        }
        break;
      }
      case "error":
        console.error("OPFS error:", msg.message);
        break;
    }
  }

  private sendCommand(
    cmd: OPFSWorkerCommand,
    callback?: (resp: WorkerResponse) => void,
  ): void {
    if (callback) {
      const id = `_cb_${this.nextMessageId++}`;
      this.callbacks.set(cmd.type, callback);
    }
    this.worker.postMessage(cmd);
  }

  // ─── Public API ──────────────────────────────────────

  writeFile(
    name: string,
    data: ArrayBuffer,
    callback?: (resp: WorkerResponse) => void,
  ): void {
    const sab = new SharedArrayBuffer(data.byteLength);
    new Uint8Array(sab).set(new Uint8Array(data));

    this.sendCommand({ type: "write", name, sab }, (resp) => {
      console.log(`写入完成：${resp.name} 版本 ${resp.version}`);
      callback?.(resp);
      if (this.hasAttribute("ui")) this.refreshFileList();
    });
  }

  readFile(
    name: string,
    version?: number,
    callback?: (buffer: ArrayBuffer) => void,
  ): void {
    const fileEntry = this.files.find((f) => f.name === name);
    const ver = version ?? fileEntry?.version ?? 1;
    const sab = new SharedArrayBuffer(1024 * 1024);

    this.sendCommand({ type: "read", name, version: ver, sab }, (resp) => {
      const size = resp.size ?? 0;
      const buffer = sab.slice(0, size);
      callback?.(buffer);
    });
  }

  refreshFileList(): void {
    this.sendCommand({ type: "list" });
  }

  deleteFile(
    name: string,
    version?: number,
    callback?: (resp: WorkerResponse) => void,
  ): void {
    this.sendCommand({ type: "delete", name, version }, (resp) => {
      console.log(`删除完成：${resp.name} 版本 ${resp.version}`);
      callback?.(resp);
      if (this.hasAttribute("ui")) this.refreshFileList();
    });
  }

  restoreVersion(
    name: string,
    version: number,
    callback?: (resp: WorkerResponse) => void,
  ): void {
    this.sendCommand({ type: "restore", name, version }, (resp) => {
      console.log(`还原完成：${resp.name} 新版本 ${resp.version}`);
      callback?.(resp);
      if (this.hasAttribute("ui")) this.refreshFileList();
    });
  }

  // ─── UI rendering ────────────────────────────────────

  private renderUI(): void {
    const grid = this.shadowRoot!.getElementById("fileGrid")!;
    grid.innerHTML = "";

    for (const file of this.files) {
      const item = document.createElement("div");
      item.className = "file-item";

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const plugin = OpfsFinder.plugins.find((p) => p.extension === ext);

      if (plugin) {
        const fakeFile = new File([], file.name);
        item.appendChild(plugin.preview(fakeFile));
      } else if (isImage(ext)) {
        const img = document.createElement("img");
        this.readFile(file.name, file.version, (buffer) => {
          const blob = new Blob([buffer]);
          img.src = URL.createObjectURL(blob);
        });
        item.appendChild(img);
      } else {
        const icon = document.createElement("div");
        icon.textContent = "📄";
        icon.style.fontSize = "48px";
        item.appendChild(icon);
      }

      const info = document.createElement("div");
      info.className = "file-info";
      info.textContent = `${file.name} (${formatSize(file.size)})`;
      item.appendChild(info);

      grid.appendChild(item);
    }
  }

  // ─── Plugin system ────────────────────────────────────

  static registerPlugin(plugin: FilePlugin): void {
    OpfsFinder.plugins.push(plugin);
  }
}

// Auto-register the custom element
if (typeof customElements !== "undefined") {
  customElements.define("opfs-finder", OpfsFinder);
}
