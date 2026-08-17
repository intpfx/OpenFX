import {
  parsePrivateMeshCatalogEntry,
  PRIVATE_MESH_MAX_CATALOG_ENTRIES,
  PRIVATE_MESH_MAX_THUMBNAIL_BYTES,
  type PrivateMeshCatalogEntry,
} from "./private-mesh-catalog.ts";

export type { PrivateMeshCatalogEntry } from "./private-mesh-catalog.ts";

const TRANSFER_VERSION = 1 as const;
const FILE_CHUNK_BYTES = 12 * 1024;
const MAX_REMOTE_FILE_BYTES = 4 * 1024 * 1024;
const MAX_REMOTE_THUMBNAIL_BYTES = PRIVATE_MESH_MAX_THUMBNAIL_BYTES;
const MAX_CATALOG_ENTRIES = PRIVATE_MESH_MAX_CATALOG_ENTRIES;
const MAX_MESSAGE_CHARS = 64 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const EMPTY_FILE_CHAIN_SHA256 = "0".repeat(64);

export const PRIVATE_MESH_PRESERVE_ABORT_REASON =
  "openfx-private-mesh-preserve-interrupted-transfer";

export type PrivateMeshFileMetadata = Readonly<{
  itemId: string;
  name: string;
  mimeType: string;
  lastModified: number;
  size: number;
}>;

export type PrivateMeshFileCheckpoint = Readonly<{
  offset: number;
  chunks: number;
  chainSha256: string;
}>;

export type PrivateMeshFileAbortDisposition = "discard" | "preserve";

export type PrivateMeshFileSink = Readonly<{
  start: (
    metadata: PrivateMeshFileMetadata,
  ) =>
    | void
    | PrivateMeshFileCheckpoint
    | Promise<void | PrivateMeshFileCheckpoint>;
  write: (
    chunk: Uint8Array<ArrayBuffer>,
    checkpoint: PrivateMeshFileCheckpoint,
  ) => void | Promise<void>;
  commit: () => void | Promise<void>;
  abort: (
    reason: Error,
    disposition: PrivateMeshFileAbortDisposition,
  ) => void | Promise<void>;
}>;

export type PrivateMeshTransferAdapter = Readonly<{
  listCatalog: () => Promise<readonly PrivateMeshCatalogEntry[]>;
  readFile: (itemId: string, signal: AbortSignal) => Promise<File>;
  readThumbnail?: (itemId: string) => Promise<Blob>;
  onCatalogChanged?: () => void | Promise<void>;
  acceptEpochUpdate?: (updateCode: string) => Promise<void>;
}>;

type TransferMessage =
  | { version: 1; type: "catalog-changed"; requestId: string }
  | { version: 1; type: "catalog-request"; requestId: string }
  | { version: 1; type: "catalog-start"; requestId: string; count: number }
  | {
    version: 1;
    type: "catalog-entry";
    requestId: string;
    entry: PrivateMeshCatalogEntry;
  }
  | { version: 1; type: "catalog-end"; requestId: string }
  | { version: 1; type: "file-request"; requestId: string; itemId: string }
  | { version: 1; type: "file-cancel"; requestId: string }
  | {
    version: 1;
    type: "file-start-ack";
    requestId: string;
    offset: number;
    chunks: number;
    chainSha256: string;
  }
  | {
    version: 1;
    type: "file-start";
    requestId: string;
    itemId: string;
    name: string;
    mimeType: string;
    lastModified: number;
    size: number;
  }
  | {
    version: 1;
    type: "file-chunk";
    requestId: string;
    index: number;
    bytes: string;
    sha256: string;
  }
  | { version: 1; type: "file-chunk-ack"; requestId: string; index: number }
  | {
    version: 1;
    type: "file-end";
    requestId: string;
    chunks: number;
    chainSha256: string;
  }
  | { version: 1; type: "thumbnail-request"; requestId: string; itemId: string }
  | {
    version: 1;
    type: "thumbnail-start";
    requestId: string;
    itemId: string;
    mimeType: "image/webp";
    size: number;
  }
  | {
    version: 1;
    type: "thumbnail-chunk";
    requestId: string;
    index: number;
    bytes: string;
  }
  | { version: 1; type: "thumbnail-end"; requestId: string; chunks: number }
  | { version: 1; type: "epoch-update"; requestId: string; updateCode: string }
  | { version: 1; type: "epoch-update-ack"; requestId: string }
  | { version: 1; type: "error"; requestId: string; message: string };

type PendingCatalog = {
  entries: PrivateMeshCatalogEntry[];
  expectedCount?: number;
  resolve: (entries: readonly PrivateMeshCatalogEntry[]) => void;
  reject: (error: Error) => void;
  timeout: number;
};

type PendingFile = {
  itemId: string;
  sink: PrivateMeshFileSink;
  metadata?: PrivateMeshFileMetadata;
  expectedSize?: number;
  receivedSize: number;
  nextChunkIndex: number;
  chainSha256: string;
  resolve: (metadata: PrivateMeshFileMetadata) => void;
  reject: (error: Error) => void;
  timeout: number;
  cleanupAbort?: () => void;
};

type OutgoingFileAcknowledgement = {
  type: "start" | "chunk";
  index?: number;
  resolve: (checkpoint?: PrivateMeshFileCheckpoint) => void;
  reject: (error: Error) => void;
  timeout: number;
};

type OutgoingFileTransfer = {
  controller: AbortController;
  acknowledgement?: OutgoingFileAcknowledgement;
};

type PendingEpochUpdate = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: number;
};

type PendingThumbnail = {
  itemId: string;
  chunks: Uint8Array<ArrayBuffer>[];
  expectedSize?: number;
  mimeType?: "image/webp";
  resolve: (thumbnail: Blob) => void;
  reject: (error: Error) => void;
  timeout: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCatalogEntry(value: unknown): PrivateMeshCatalogEntry | null {
  try {
    return parsePrivateMeshCatalogEntry(value);
  } catch {
    return null;
  }
}

function parseMessage(value: unknown): TransferMessage {
  if (
    !isRecord(value) || value.version !== TRANSFER_VERSION ||
    typeof value.type !== "string" || typeof value.requestId !== "string" ||
    !value.requestId || value.requestId.length > 200
  ) throw new Error("设备传输消息无效");
  switch (value.type) {
    case "catalog-changed":
    case "catalog-request":
    case "catalog-end":
    case "file-cancel":
    case "epoch-update-ack":
      return value as unknown as TransferMessage;
    case "file-start-ack":
      if (
        typeof value.offset !== "number" || !Number.isSafeInteger(value.offset) ||
        value.offset < 0 || value.offset > MAX_REMOTE_FILE_BYTES ||
        typeof value.chunks !== "number" || !Number.isSafeInteger(value.chunks) ||
        value.chunks < 0 ||
        typeof value.chainSha256 !== "string" ||
        !/^[0-9a-f]{64}$/u.test(value.chainSha256)
      ) break;
      return value as unknown as TransferMessage;
    case "catalog-start":
      if (
        typeof value.count !== "number" || !Number.isSafeInteger(value.count) ||
        value.count < 0 || value.count > MAX_CATALOG_ENTRIES
      ) break;
      return value as unknown as TransferMessage;
    case "catalog-entry": {
      const entry = parseCatalogEntry(value.entry);
      if (!entry) break;
      return {
        version: TRANSFER_VERSION,
        type: "catalog-entry",
        requestId: value.requestId,
        entry,
      };
    }
    case "file-request":
      if (typeof value.itemId !== "string" || value.itemId.length > 200) break;
      return value as unknown as TransferMessage;
    case "thumbnail-request":
      if (typeof value.itemId !== "string" || value.itemId.length > 200) break;
      return value as unknown as TransferMessage;
    case "file-start":
      if (
        typeof value.itemId !== "string" || value.itemId.length > 200 ||
        typeof value.name !== "string" || value.name.length > 255 ||
        typeof value.mimeType !== "string" || value.mimeType.length > 200 ||
        typeof value.lastModified !== "number" ||
        !Number.isSafeInteger(value.lastModified) || value.lastModified < 0 ||
        typeof value.size !== "number" || !Number.isSafeInteger(value.size) ||
        value.size < 0 || value.size > MAX_REMOTE_FILE_BYTES
      ) break;
      return value as unknown as TransferMessage;
    case "file-chunk":
      if (
        typeof value.index !== "number" || !Number.isSafeInteger(value.index) ||
        value.index < 0 || typeof value.bytes !== "string" ||
        typeof value.sha256 !== "string" ||
        !/^[0-9a-f]{64}$/u.test(value.sha256)
      ) break;
      return value as unknown as TransferMessage;
    case "file-chunk-ack":
      if (
        typeof value.index !== "number" || !Number.isSafeInteger(value.index) ||
        value.index < 0
      ) break;
      return value as unknown as TransferMessage;
    case "file-end":
      if (
        typeof value.chunks !== "number" || !Number.isSafeInteger(value.chunks) ||
        value.chunks < 0 || typeof value.chainSha256 !== "string" ||
        !/^[0-9a-f]{64}$/u.test(value.chainSha256)
      ) break;
      return value as unknown as TransferMessage;
    case "thumbnail-start":
      if (
        typeof value.itemId !== "string" || value.itemId.length > 200 ||
        value.mimeType !== "image/webp" ||
        typeof value.size !== "number" || !Number.isSafeInteger(value.size) ||
        value.size < 0 || value.size > MAX_REMOTE_THUMBNAIL_BYTES
      ) break;
      return value as unknown as TransferMessage;
    case "thumbnail-chunk":
      if (
        typeof value.index !== "number" || !Number.isSafeInteger(value.index) ||
        value.index < 0 || typeof value.bytes !== "string"
      ) break;
      return value as unknown as TransferMessage;
    case "thumbnail-end":
      if (
        typeof value.chunks !== "number" || !Number.isSafeInteger(value.chunks) ||
        value.chunks < 0
      ) break;
      return value as unknown as TransferMessage;
    case "epoch-update":
      if (
        typeof value.updateCode !== "string" ||
        !value.updateCode.startsWith("openfx-epoch-v1.") ||
        value.updateCode.length > MAX_MESSAGE_CHARS / 2
      ) break;
      return value as unknown as TransferMessage;
    case "error":
      if (typeof value.message !== "string") break;
      return value as unknown as TransferMessage;
  }
  throw new Error("设备传输消息无效");
}

function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Bytes(value: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", value),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function extendFileChainSha256(
  previous: string,
  index: number,
  chunkSha256: string,
): Promise<string> {
  const input = new Uint8Array(68);
  input.set(hexToBytes(previous), 0);
  new DataView(input.buffer).setUint32(32, index, false);
  input.set(hexToBytes(chunkSha256), 36);
  return await sha256Bytes(input);
}

function emptyFileCheckpoint(): PrivateMeshFileCheckpoint {
  return {
    offset: 0,
    chunks: 0,
    chainSha256: EMPTY_FILE_CHAIN_SHA256,
  };
}

function validateFileCheckpoint(
  checkpoint: PrivateMeshFileCheckpoint,
  size: number,
): PrivateMeshFileCheckpoint {
  const expectedChunks = checkpoint.offset === 0
    ? 0
    : Math.ceil(checkpoint.offset / FILE_CHUNK_BYTES);
  if (
    !Number.isSafeInteger(checkpoint.offset) || checkpoint.offset < 0 ||
    checkpoint.offset > size || !Number.isSafeInteger(checkpoint.chunks) ||
    checkpoint.chunks !== expectedChunks ||
    !/^[0-9a-f]{64}$/u.test(checkpoint.chainSha256) ||
    (checkpoint.offset < size && checkpoint.offset % FILE_CHUNK_BYTES !== 0)
  ) throw new Error("远程文件续传检查点无效");
  if (
    checkpoint.offset === 0 &&
    checkpoint.chainSha256 !== EMPTY_FILE_CHAIN_SHA256
  ) throw new Error("远程文件续传检查点无效");
  return checkpoint;
}

function remoteErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "远程设备操作失败";
  return message.slice(0, 300);
}

export function createPrivateMeshTransferSession(
  channel: RTCDataChannel,
  adapter: PrivateMeshTransferAdapter,
) {
  const pendingCatalogs = new Map<string, PendingCatalog>();
  const pendingFiles = new Map<string, PendingFile>();
  const pendingThumbnails = new Map<string, PendingThumbnail>();
  const pendingEpochUpdates = new Map<string, PendingEpochUpdate>();
  const outgoingFileTransfers = new Map<string, OutgoingFileTransfer>();
  let disposed = false;

  async function send(message: TransferMessage): Promise<void> {
    if (disposed || channel.readyState !== "open") {
      throw new Error("设备数据通道尚未连接");
    }
    const encoded = JSON.stringify(message);
    if (encoded.length > MAX_MESSAGE_CHARS) throw new Error("设备传输消息过大");
    while (channel.bufferedAmount > 256 * 1024) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          channel.removeEventListener("bufferedamountlow", ready);
          reject(new Error("设备传输缓冲区长时间繁忙"));
        }, 5_000);
        const ready = () => {
          clearTimeout(timeout);
          channel.removeEventListener("bufferedamountlow", ready);
          resolve();
        };
        channel.bufferedAmountLowThreshold = 128 * 1024;
        channel.addEventListener("bufferedamountlow", ready, { once: true });
      });
    }
    channel.send(encoded);
  }

  async function sendError(requestId: string, error: unknown): Promise<void> {
    await send({
      version: TRANSFER_VERSION,
      type: "error",
      requestId,
      message: remoteErrorMessage(error),
    });
  }

  function rejectOutgoingAcknowledgement(
    transfer: OutgoingFileTransfer,
    error: Error,
  ): void {
    const acknowledgement = transfer.acknowledgement;
    if (!acknowledgement) return;
    transfer.acknowledgement = undefined;
    clearTimeout(acknowledgement.timeout);
    acknowledgement.reject(error);
  }

  function abortOutgoingFileTransfer(
    transfer: OutgoingFileTransfer,
    error = new Error("远程文件发送已取消"),
  ): void {
    transfer.controller.abort();
    rejectOutgoingAcknowledgement(transfer, error);
  }

  async function sendFileMessageAndWaitForAcknowledgement(
    transfer: OutgoingFileTransfer,
    message: TransferMessage,
    expected: { type: "start" | "chunk"; index?: number },
  ): Promise<PrivateMeshFileCheckpoint | undefined> {
    transfer.controller.signal.throwIfAborted();
    if (transfer.acknowledgement) {
      throw new Error("远程文件确认状态无效");
    }
    let acknowledgement!: OutgoingFileAcknowledgement;
    let acknowledgementTimeout = 0;
    const received = new Promise<PrivateMeshFileCheckpoint | undefined>(
      (resolve, reject) => {
        acknowledgementTimeout = setTimeout(() => {
          if (transfer.acknowledgement === acknowledgement) {
            transfer.acknowledgement = undefined;
          }
          reject(new Error("等待远程文件分块确认超时"));
        }, REQUEST_TIMEOUT_MS);
        acknowledgement = {
          ...expected,
          resolve,
          reject,
          timeout: acknowledgementTimeout,
        };
        transfer.acknowledgement = acknowledgement;
      },
    );
    try {
      await send(message);
      return await received;
    } catch (error) {
      if (transfer.acknowledgement === acknowledgement) {
        transfer.acknowledgement = undefined;
        clearTimeout(acknowledgementTimeout);
      }
      throw error;
    }
  }

  async function provideCatalog(requestId: string): Promise<void> {
    const sourceEntries = await adapter.listCatalog();
    if (sourceEntries.length > MAX_CATALOG_ENTRIES) {
      throw new Error("本机目录包含无效或过多条目");
    }
    let entries: readonly PrivateMeshCatalogEntry[];
    try {
      entries = sourceEntries.map(parsePrivateMeshCatalogEntry);
    } catch {
      throw new Error("本机目录包含无效或过多条目");
    }
    await send({
      version: TRANSFER_VERSION,
      type: "catalog-start",
      requestId,
      count: entries.length,
    });
    for (const entry of entries) {
      await send({
        version: TRANSFER_VERSION,
        type: "catalog-entry",
        requestId,
        entry,
      });
    }
    await send({ version: TRANSFER_VERSION, type: "catalog-end", requestId });
  }

  async function provideFile(
    requestId: string,
    itemId: string,
    transfer: OutgoingFileTransfer,
  ): Promise<void> {
    const signal = transfer.controller.signal;
    const source = await adapter.readFile(itemId, signal);
    signal.throwIfAborted();
    if (source.size > MAX_REMOTE_FILE_BYTES) {
      throw new Error("首个传输切片只允许读取不超过 4 MiB 的文件");
    }
    if (
      source.name.length > 255 || source.type.length > 200 ||
      !Number.isSafeInteger(source.lastModified) || source.lastModified < 0
    ) throw new Error("本机文件元数据无效");
    const resume = validateFileCheckpoint(
      (await sendFileMessageAndWaitForAcknowledgement(transfer, {
        version: TRANSFER_VERSION,
        type: "file-start",
        requestId,
        itemId,
        name: source.name,
        mimeType: source.type,
        lastModified: source.lastModified,
        size: source.size,
      }, { type: "start" })) ?? emptyFileCheckpoint(),
      source.size,
    );
    let offset = 0;
    let chunks = 0;
    let chainSha256 = EMPTY_FILE_CHAIN_SHA256;
    while (chunks < resume.chunks) {
      signal.throwIfAborted();
      const bytes = new Uint8Array(
        await source.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer(),
      );
      const chunkSha256 = await sha256Bytes(bytes);
      chainSha256 = await extendFileChainSha256(
        chainSha256,
        chunks,
        chunkSha256,
      );
      offset += bytes.byteLength;
      chunks += 1;
    }
    if (
      offset !== resume.offset || chainSha256 !== resume.chainSha256
    ) throw new Error("续传检查点与远程原件不匹配");
    for (; offset < source.size; offset += FILE_CHUNK_BYTES) {
      signal.throwIfAborted();
      const bytes = new Uint8Array(
        await source.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer(),
      );
      signal.throwIfAborted();
      const chunkSha256 = await sha256Bytes(bytes);
      chainSha256 = await extendFileChainSha256(
        chainSha256,
        chunks,
        chunkSha256,
      );
      signal.throwIfAborted();
      await sendFileMessageAndWaitForAcknowledgement(transfer, {
        version: TRANSFER_VERSION,
        type: "file-chunk",
        requestId,
        index: chunks,
        bytes: bytesToBase64(bytes),
        sha256: chunkSha256,
      }, { type: "chunk", index: chunks });
      chunks += 1;
    }
    signal.throwIfAborted();
    await send({
      version: TRANSFER_VERSION,
      type: "file-end",
      requestId,
      chunks,
      chainSha256,
    });
  }

  async function provideThumbnail(
    requestId: string,
    itemId: string,
  ): Promise<void> {
    if (!adapter.readThumbnail) throw new Error("本机没有可用的派生缩略图");
    const thumbnail = await adapter.readThumbnail(itemId);
    if (
      thumbnail.type !== "image/webp" ||
      thumbnail.size > MAX_REMOTE_THUMBNAIL_BYTES
    ) throw new Error("派生缩略图格式无效或超过 128 KiB");
    await send({
      version: TRANSFER_VERSION,
      type: "thumbnail-start",
      requestId,
      itemId,
      mimeType: "image/webp",
      size: thumbnail.size,
    });
    let chunks = 0;
    for (let offset = 0; offset < thumbnail.size; offset += FILE_CHUNK_BYTES) {
      const bytes = new Uint8Array(
        await thumbnail.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer(),
      );
      await send({
        version: TRANSFER_VERSION,
        type: "thumbnail-chunk",
        requestId,
        index: chunks,
        bytes: bytesToBase64(bytes),
      });
      chunks += 1;
    }
    await send({
      version: TRANSFER_VERSION,
      type: "thumbnail-end",
      requestId,
      chunks,
    });
  }

  function refreshPendingFileTimeout(
    requestId: string,
    pending: PendingFile,
  ): void {
    clearTimeout(pending.timeout);
    pending.timeout = setTimeout(() => {
      void failPendingFile(
        requestId,
        pending,
        new Error("读取远程文件超时"),
        true,
        "preserve",
      );
    }, REQUEST_TIMEOUT_MS);
  }

  async function failPendingFile(
    requestId: string,
    pending: PendingFile,
    error: Error,
    notifyRemote = true,
    disposition: PrivateMeshFileAbortDisposition = "discard",
  ): Promise<void> {
    if (pendingFiles.get(requestId) !== pending) return;
    pendingFiles.delete(requestId);
    clearTimeout(pending.timeout);
    pending.cleanupAbort?.();
    if (notifyRemote) {
      void send({
        version: TRANSFER_VERSION,
        type: "file-cancel",
        requestId,
      }).catch(() => undefined);
    }
    try {
      await pending.sink.abort(error, disposition);
    } catch {
      // The original transfer error remains the useful failure for the caller.
    }
    pending.reject(error);
  }

  async function completePendingFile(
    requestId: string,
    pending: PendingFile,
  ): Promise<void> {
    const metadata = pending.metadata;
    if (!metadata) {
      await failPendingFile(
        requestId,
        pending,
        new Error("远程文件传输不完整"),
      );
      return;
    }
    if (pendingFiles.get(requestId) !== pending) return;
    pendingFiles.delete(requestId);
    clearTimeout(pending.timeout);
    pending.cleanupAbort?.();
    try {
      await pending.sink.commit();
    } catch (error) {
      const failure = error instanceof Error
        ? error
        : new Error("远程文件暂存提交失败");
      try {
        await pending.sink.abort(failure, "preserve");
      } catch {
        // The commit error remains the useful failure for the caller.
      }
      pending.reject(failure);
      return;
    }
    pending.resolve(metadata);
  }

  async function handleMessage(event: MessageEvent): Promise<void> {
    if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE_CHARS) {
      throw new Error("设备传输消息无效");
    }
    const message = parseMessage(JSON.parse(event.data));
    if (message.type === "catalog-changed") {
      await adapter.onCatalogChanged?.();
      return;
    }
    if (message.type === "catalog-request") {
      try {
        await provideCatalog(message.requestId);
      } catch (error) {
        await sendError(message.requestId, error);
      }
      return;
    }
    if (message.type === "file-request") {
      const previous = outgoingFileTransfers.get(message.requestId);
      if (previous) abortOutgoingFileTransfer(previous);
      const transfer: OutgoingFileTransfer = {
        controller: new AbortController(),
      };
      outgoingFileTransfers.set(message.requestId, transfer);
      try {
        await provideFile(message.requestId, message.itemId, transfer);
      } catch (error) {
        if (!transfer.controller.signal.aborted) {
          await sendError(message.requestId, error);
        }
      } finally {
        if (outgoingFileTransfers.get(message.requestId) === transfer) {
          rejectOutgoingAcknowledgement(
            transfer,
            new Error("远程文件发送已结束"),
          );
          outgoingFileTransfers.delete(message.requestId);
        }
      }
      return;
    }
    if (message.type === "file-cancel") {
      const transfer = outgoingFileTransfers.get(message.requestId);
      if (transfer) abortOutgoingFileTransfer(transfer);
      return;
    }
    if (
      message.type === "file-start-ack" || message.type === "file-chunk-ack"
    ) {
      const transfer = outgoingFileTransfers.get(message.requestId);
      const acknowledgement = transfer?.acknowledgement;
      const matches = message.type === "file-start-ack"
        ? acknowledgement?.type === "start"
        : acknowledgement?.type === "chunk" &&
          acknowledgement.index === message.index;
      if (!transfer || !acknowledgement || !matches) return;
      transfer.acknowledgement = undefined;
      clearTimeout(acknowledgement.timeout);
      acknowledgement.resolve(
        message.type === "file-start-ack"
          ? {
            offset: message.offset,
            chunks: message.chunks,
            chainSha256: message.chainSha256,
          }
          : undefined,
      );
      return;
    }
    if (message.type === "thumbnail-request") {
      try {
        await provideThumbnail(message.requestId, message.itemId);
      } catch (error) {
        await sendError(message.requestId, error);
      }
      return;
    }
    if (message.type === "epoch-update") {
      try {
        if (!adapter.acceptEpochUpdate) {
          throw new Error("当前设备不支持私有网络密钥更新");
        }
        await adapter.acceptEpochUpdate(message.updateCode);
        await send({
          version: TRANSFER_VERSION,
          type: "epoch-update-ack",
          requestId: message.requestId,
        });
      } catch (error) {
        await sendError(message.requestId, error);
      }
      return;
    }
    if (message.type === "error") {
      const pendingFile = pendingFiles.get(message.requestId);
      if (pendingFile) {
        await failPendingFile(
          message.requestId,
          pendingFile,
          new Error(message.message),
          false,
        );
        return;
      }
      const pending = pendingCatalogs.get(message.requestId) ??
        pendingThumbnails.get(message.requestId) ??
        pendingEpochUpdates.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(message.message));
      }
      pendingCatalogs.delete(message.requestId);
      pendingThumbnails.delete(message.requestId);
      pendingEpochUpdates.delete(message.requestId);
      return;
    }
    if (message.type === "epoch-update-ack") {
      const pending = pendingEpochUpdates.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      pendingEpochUpdates.delete(message.requestId);
      pending.resolve();
      return;
    }
    if (message.type === "catalog-start") {
      const pending = pendingCatalogs.get(message.requestId);
      if (pending) pending.expectedCount = message.count;
      return;
    }
    if (message.type === "catalog-entry") {
      const pending = pendingCatalogs.get(message.requestId);
      if (!pending || pending.entries.length >= MAX_CATALOG_ENTRIES) return;
      pending.entries.push(message.entry);
      return;
    }
    if (message.type === "catalog-end") {
      const pending = pendingCatalogs.get(message.requestId);
      if (!pending) return;
      if (pending.expectedCount !== pending.entries.length) {
        pending.reject(new Error("远程目录传输不完整"));
      } else {
        pending.resolve(pending.entries);
      }
      clearTimeout(pending.timeout);
      pendingCatalogs.delete(message.requestId);
      return;
    }
    if (message.type === "file-start") {
      const pending = pendingFiles.get(message.requestId);
      if (!pending || pending.itemId !== message.itemId) return;
      if (pending.metadata) {
        await failPendingFile(
          message.requestId,
          pending,
          new Error("远程文件传输状态无效"),
        );
        return;
      }
      const metadata: PrivateMeshFileMetadata = {
        itemId: message.itemId,
        name: message.name,
        mimeType: message.mimeType,
        lastModified: message.lastModified,
        size: message.size,
      };
      try {
        const checkpoint = validateFileCheckpoint(
          (await pending.sink.start(metadata)) ?? emptyFileCheckpoint(),
          metadata.size,
        );
        if (pendingFiles.get(message.requestId) !== pending) return;
        pending.metadata = metadata;
        pending.expectedSize = metadata.size;
        pending.receivedSize = checkpoint.offset;
        pending.nextChunkIndex = checkpoint.chunks;
        pending.chainSha256 = checkpoint.chainSha256;
        refreshPendingFileTimeout(message.requestId, pending);
        await send({
          version: TRANSFER_VERSION,
          type: "file-start-ack",
          requestId: message.requestId,
          offset: checkpoint.offset,
          chunks: checkpoint.chunks,
          chainSha256: checkpoint.chainSha256,
        });
      } catch (error) {
        await failPendingFile(
          message.requestId,
          pending,
          error instanceof Error ? error : new Error("无法创建远程文件暂存"),
        );
      }
      return;
    }
    if (message.type === "file-chunk") {
      const pending = pendingFiles.get(message.requestId);
      if (!pending) return;
      if (!pending.metadata || message.index !== pending.nextChunkIndex) {
        await failPendingFile(
          message.requestId,
          pending,
          new Error("远程文件分块顺序无效"),
        );
        return;
      }
      let preserveCheckpoint = false;
      try {
        const bytes = base64ToBytes(message.bytes);
        const chunkBytes = bytes.byteLength;
        if (
          chunkBytes > FILE_CHUNK_BYTES ||
          pending.receivedSize + chunkBytes >
            (pending.expectedSize ?? MAX_REMOTE_FILE_BYTES)
        ) throw new Error("远程文件超过 4 MiB 限制");
        const chunkSha256 = await sha256Bytes(bytes);
        if (chunkSha256 !== message.sha256) {
          throw new Error("远程文件完整性校验失败");
        }
        const chainSha256 = await extendFileChainSha256(
          pending.chainSha256,
          message.index,
          chunkSha256,
        );
        const checkpoint: PrivateMeshFileCheckpoint = {
          offset: pending.receivedSize + chunkBytes,
          chunks: pending.nextChunkIndex + 1,
          chainSha256,
        };
        preserveCheckpoint = true;
        await pending.sink.write(bytes, checkpoint);
        if (pendingFiles.get(message.requestId) !== pending) return;
        pending.receivedSize += chunkBytes;
        pending.nextChunkIndex += 1;
        pending.chainSha256 = chainSha256;
        refreshPendingFileTimeout(message.requestId, pending);
        await send({
          version: TRANSFER_VERSION,
          type: "file-chunk-ack",
          requestId: message.requestId,
          index: message.index,
        });
      } catch (error) {
        await failPendingFile(
          message.requestId,
          pending,
          error instanceof Error ? error : new Error("远程文件分块写入失败"),
          true,
          preserveCheckpoint ? "preserve" : "discard",
        );
      }
      return;
    }
    if (message.type === "file-end") {
      const pending = pendingFiles.get(message.requestId);
      if (!pending) return;
      if (
        !pending.metadata || pending.expectedSize !== pending.receivedSize ||
        message.chunks !== pending.nextChunkIndex ||
        message.chainSha256 !== pending.chainSha256
      ) {
        await failPendingFile(
          message.requestId,
          pending,
          message.chainSha256 !== pending.chainSha256
            ? new Error("远程文件完整性校验失败")
            : new Error("远程文件传输不完整"),
        );
      } else {
        await completePendingFile(message.requestId, pending);
      }
      return;
    }
    if (message.type === "thumbnail-start") {
      const pending = pendingThumbnails.get(message.requestId);
      if (!pending || pending.itemId !== message.itemId) return;
      pending.mimeType = message.mimeType;
      pending.expectedSize = message.size;
      return;
    }
    if (message.type === "thumbnail-chunk") {
      const pending = pendingThumbnails.get(message.requestId);
      if (!pending || message.index !== pending.chunks.length) return;
      const bytes = base64ToBytes(message.bytes);
      const received = pending.chunks.reduce(
        (sum, chunk) => sum + chunk.byteLength,
        0,
      );
      if (received + bytes.byteLength > MAX_REMOTE_THUMBNAIL_BYTES) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("远程缩略图超过 128 KiB 限制"));
        pendingThumbnails.delete(message.requestId);
        return;
      }
      pending.chunks.push(bytes);
      return;
    }
    if (message.type === "thumbnail-end") {
      const pending = pendingThumbnails.get(message.requestId);
      if (!pending) return;
      const size = pending.chunks.reduce(
        (sum, chunk) => sum + chunk.byteLength,
        0,
      );
      if (
        pending.mimeType !== "image/webp" || pending.expectedSize !== size ||
        message.chunks !== pending.chunks.length
      ) {
        pending.reject(new Error("远程缩略图传输不完整"));
      } else {
        pending.resolve(new Blob(pending.chunks, { type: pending.mimeType }));
      }
      clearTimeout(pending.timeout);
      pendingThumbnails.delete(message.requestId);
    }
  }

  const messageListener = (event: MessageEvent) => {
    void handleMessage(event).catch(() => undefined);
  };
  channel.addEventListener("message", messageListener);

  function requestCatalog(): Promise<readonly PrivateMeshCatalogEntry[]> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingCatalogs.delete(requestId);
        reject(new Error("读取远程目录超时"));
      }, REQUEST_TIMEOUT_MS);
      pendingCatalogs.set(requestId, { entries: [], resolve, reject, timeout });
      void send({
        version: TRANSFER_VERSION,
        type: "catalog-request",
        requestId,
      }).catch((error) => {
        clearTimeout(timeout);
        pendingCatalogs.delete(requestId);
        reject(error);
      });
    });
  }

  function notifyCatalogChanged(): Promise<void> {
    return send({
      version: TRANSFER_VERSION,
      type: "catalog-changed",
      requestId: crypto.randomUUID(),
    });
  }

  function requestFileToSink(
    itemId: string,
    sink: PrivateMeshFileSink,
    options: { signal?: AbortSignal } = {},
  ): Promise<PrivateMeshFileMetadata> {
    if (!itemId || itemId.length > 200) {
      return Promise.reject(new Error("远程文件 ID 无效"));
    }
    if (options.signal?.aborted) {
      return Promise.reject(new Error("已取消读取远程文件"));
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = pendingFiles.get(requestId);
        if (pending) {
          void failPendingFile(
            requestId,
            pending,
            new Error("读取远程文件超时"),
            true,
            "preserve",
          );
        }
      }, REQUEST_TIMEOUT_MS);
      const onAbort = () => {
        const pending = pendingFiles.get(requestId);
        if (pending) {
          void failPendingFile(
            requestId,
            pending,
            new Error("已取消读取远程文件"),
            true,
            options.signal?.reason === PRIVATE_MESH_PRESERVE_ABORT_REASON
              ? "preserve"
              : "discard",
          );
        }
      };
      const cleanupAbort = options.signal
        ? () => options.signal?.removeEventListener("abort", onAbort)
        : undefined;
      pendingFiles.set(requestId, {
        itemId,
        sink,
        receivedSize: 0,
        nextChunkIndex: 0,
        chainSha256: EMPTY_FILE_CHAIN_SHA256,
        resolve,
        reject,
        timeout,
        cleanupAbort,
      });
      options.signal?.addEventListener("abort", onAbort, { once: true });
      void send({
        version: TRANSFER_VERSION,
        type: "file-request",
        requestId,
        itemId,
      }).catch((error) => {
        const pending = pendingFiles.get(requestId);
        if (pending) {
          void failPendingFile(
            requestId,
            pending,
            error instanceof Error ? error : new Error("无法请求远程文件"),
            false,
            "preserve",
          );
        }
      });
    });
  }

  async function requestFile(
    itemId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<File> {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let metadata: PrivateMeshFileMetadata | undefined;
    const completed = await requestFileToSink(itemId, {
      start: (value) => {
        metadata = value;
      },
      write: (chunk) => {
        chunks.push(chunk.slice());
      },
      commit: () => undefined,
      abort: () => {
        chunks.length = 0;
      },
    }, options);
    const source = metadata ?? completed;
    return new File(chunks, source.name, {
      type: source.mimeType,
      lastModified: source.lastModified,
    });
  }

  function requestThumbnail(itemId: string): Promise<Blob> {
    if (!itemId || itemId.length > 200) {
      return Promise.reject(new Error("远程缩略图文件 ID 无效"));
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingThumbnails.delete(requestId);
        reject(new Error("读取远程缩略图超时"));
      }, REQUEST_TIMEOUT_MS);
      pendingThumbnails.set(requestId, {
        itemId,
        chunks: [],
        resolve,
        reject,
        timeout,
      });
      void send({
        version: TRANSFER_VERSION,
        type: "thumbnail-request",
        requestId,
        itemId,
      }).catch((error) => {
        clearTimeout(timeout);
        pendingThumbnails.delete(requestId);
        reject(error);
      });
    });
  }

  function sendEpochUpdate(updateCode: string): Promise<void> {
    if (
      !updateCode.startsWith("openfx-epoch-v1.") ||
      updateCode.length > MAX_MESSAGE_CHARS / 2
    ) return Promise.reject(new Error("私有网络密钥更新码无效或过大"));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingEpochUpdates.delete(requestId);
        reject(new Error("等待远程设备确认密钥更新超时"));
      }, REQUEST_TIMEOUT_MS);
      pendingEpochUpdates.set(requestId, { resolve, reject, timeout });
      void send({
        version: TRANSFER_VERSION,
        type: "epoch-update",
        requestId,
        updateCode,
      }).catch((error) => {
        clearTimeout(timeout);
        pendingEpochUpdates.delete(requestId);
        reject(error);
      });
    });
  }

  function dispose(): void {
    if (disposed) return;
    for (const requestId of pendingFiles.keys()) {
      void send({
        version: TRANSFER_VERSION,
        type: "file-cancel",
        requestId,
      }).catch(() => undefined);
    }
    disposed = true;
    channel.removeEventListener("message", messageListener);
    const error = new Error("设备传输会话已关闭");
    for (const pending of pendingCatalogs.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    for (const pending of pendingFiles.values()) {
      clearTimeout(pending.timeout);
      pending.cleanupAbort?.();
      void Promise.resolve(pending.sink.abort(error, "preserve")).catch(() =>
        undefined
      );
      pending.reject(error);
    }
    for (const pending of pendingThumbnails.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    for (const pending of pendingEpochUpdates.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    pendingCatalogs.clear();
    pendingFiles.clear();
    pendingThumbnails.clear();
    pendingEpochUpdates.clear();
    for (const transfer of outgoingFileTransfers.values()) {
      abortOutgoingFileTransfer(transfer, error);
    }
    outgoingFileTransfers.clear();
  }

  return {
    notifyCatalogChanged,
    requestCatalog,
    requestFile,
    requestFileToSink,
    requestThumbnail,
    sendEpochUpdate,
    dispose,
  };
}

export const PRIVATE_MESH_MAX_REMOTE_FILE_BYTES = MAX_REMOTE_FILE_BYTES;
export const PRIVATE_MESH_MAX_REMOTE_THUMBNAIL_BYTES = MAX_REMOTE_THUMBNAIL_BYTES;
