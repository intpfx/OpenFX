import { formatLibraryBytes, type LibraryItem } from "./model.ts";
import type { StorageEstimate } from "./opfs-library.ts";

export type FileLibraryHudProgress = {
  total: number;
  processed: number;
  failed: number;
  active: boolean;
  ratio: number;
  label: "等待导入" | "相似整理中" | "部分失败" | "整理完成";
};

export type FileLibrarySelectionEntry = {
  id: string;
  items: readonly { id: string }[];
};

export type FileLibraryStorageSummary = {
  usageLabel: string;
  quotaLabel: string;
  availableLabel: string;
  ratio: number;
  percent: number;
  persisted: boolean;
};

export type FileLibraryStorageCloudSegmentId =
  | "available"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "other";

export type FileLibraryStorageCloudSegment = {
  id: FileLibraryStorageCloudSegmentId;
  label: string;
  bytes: number;
  valueLabel: string;
  ratio: number;
};

export type FileLibraryStorageCloud = {
  summary: FileLibraryStorageSummary | null;
  segments: FileLibraryStorageCloudSegment[];
};

export type FileLibraryStorageCloudPoint = {
  column: number;
  row: number;
  kind: FileLibraryStorageCloudSegmentId;
  tone: number;
  scale: number;
};

export type FileLibraryStorageCloudPointMotion = {
  offsetX: number;
  offsetY: number;
  scale: number;
  alpha: number;
};

export type FileLibraryHudDeviceSource = {
  localNodeId: string;
  members: readonly { nodeId: string; nodeName: string }[];
  connections: readonly {
    nodeId: string;
    status: "connecting" | "connected" | "error";
  }[];
  remoteFiles: readonly {
    nodeId: string;
    size: number;
    availability: "online" | "cached";
  }[];
};

export type FileLibraryHudDevice = {
  nodeId: string;
  nodeName: string;
  status: "local" | "online" | "offline";
  bytes: number;
  valueLabel: string;
  detail: string;
};

const STORAGE_CLOUD_CATEGORY_LABELS: Record<
  Exclude<FileLibraryStorageCloudSegmentId, "available">,
  string
> = {
  image: "照片",
  video: "视频",
  audio: "音乐",
  document: "文档",
  other: "其他",
};

const STORAGE_CLOUD_CATEGORY_ORDER = Object.keys(
  STORAGE_CLOUD_CATEGORY_LABELS,
) as Exclude<FileLibraryStorageCloudSegmentId, "available">[];

export function toggleFileLibraryEntrySelection(
  selectedItemId: string | null,
  targetEntry: FileLibrarySelectionEntry,
  entries: readonly FileLibrarySelectionEntry[],
): string | null {
  const selectedEntry = selectedItemId
    ? entries.find((entry) => entry.items.some((item) => item.id === selectedItemId))
    : null;
  return selectedEntry?.id === targetEntry.id ? null : targetEntry.items[0]?.id ?? null;
}

function normalizeStorageBytes(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function summarizeFileLibraryStorage(
  storage: StorageEstimate | null,
): FileLibraryStorageSummary | null {
  if (!storage) return null;

  const usage = normalizeStorageBytes(storage.usage);
  const quota = normalizeStorageBytes(storage.quota);
  const available = Math.max(0, quota - usage);
  const ratio = quota > 0 ? Math.min(1, usage / quota) : 0;

  return {
    usageLabel: formatLibraryBytes(usage),
    quotaLabel: formatLibraryBytes(quota),
    availableLabel: formatLibraryBytes(available),
    ratio,
    percent: Math.round(ratio * 100),
    persisted: storage.persisted,
  };
}

function getStorageCloudCategory(
  kind: LibraryItem["kind"],
): Exclude<FileLibraryStorageCloudSegmentId, "available"> | null {
  if (kind === "app") return null;
  if (kind === "image" || kind === "live-photo") return "image";
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  if (kind === "pdf" || kind === "text") return "document";
  return "other";
}

export function summarizeFileLibraryStorageCloud(
  items: readonly Pick<LibraryItem, "kind" | "size">[],
  storage: StorageEstimate | null,
): FileLibraryStorageCloud {
  const summary = summarizeFileLibraryStorage(storage);
  const quota = normalizeStorageBytes(storage?.quota ?? 0);
  if (!summary || quota === 0) {
    return {
      summary,
      segments: [{
        id: "available",
        label: "可用空间",
        bytes: 0,
        valueLabel: "读取中",
        ratio: 1,
      }],
    };
  }

  const usage = Math.min(normalizeStorageBytes(storage?.usage ?? 0), quota);
  const categoryBytes = new Map<
    Exclude<FileLibraryStorageCloudSegmentId, "available">,
    number
  >(STORAGE_CLOUD_CATEGORY_ORDER.map((category) => [category, 0]));

  for (const item of items) {
    const category = getStorageCloudCategory(item.kind);
    if (!category) continue;
    categoryBytes.set(
      category,
      (categoryBytes.get(category) ?? 0) + normalizeStorageBytes(item.size),
    );
  }

  const trackedBytes = [...categoryBytes.values()].reduce(
    (sum, bytes) => sum + bytes,
    0,
  );
  if (trackedBytes < usage) {
    categoryBytes.set(
      "other",
      (categoryBytes.get("other") ?? 0) + usage - trackedBytes,
    );
  } else if (trackedBytes > usage && trackedBytes > 0) {
    const scale = usage / trackedBytes;
    for (const category of STORAGE_CLOUD_CATEGORY_ORDER) {
      categoryBytes.set(category, (categoryBytes.get(category) ?? 0) * scale);
    }
  }

  const segments: FileLibraryStorageCloudSegment[] = [];
  const available = Math.max(0, quota - usage);
  if (available > 0) {
    segments.push({
      id: "available",
      label: "可用空间",
      bytes: available,
      valueLabel: formatLibraryBytes(available),
      ratio: available / quota,
    });
  }
  segments.push(...STORAGE_CLOUD_CATEGORY_ORDER.flatMap((id) => {
    const bytes = categoryBytes.get(id) ?? 0;
    return bytes > 0
      ? [{
        id,
        label: STORAGE_CLOUD_CATEGORY_LABELS[id],
        bytes,
        valueLabel: formatLibraryBytes(bytes),
        ratio: bytes / quota,
      }]
      : [];
  }));

  return { summary, segments };
}

function storageCloudNoise(value: number): number {
  const noise = Math.sin(value * 12.9898 + 78.233) * 43_758.5453;
  return noise - Math.floor(noise);
}

export function getFileLibraryStorageCloudPointMotion(
  point: FileLibraryStorageCloudPoint,
  elapsedMs: number,
  reducedMotion: boolean,
): FileLibraryStorageCloudPointMotion {
  if (reducedMotion) {
    return { offsetX: 0, offsetY: 0, scale: 1, alpha: 0.92 };
  }

  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const phase = point.column * 0.61 + point.row * 0.37 + point.tone * Math.PI * 2;
  const horizontalWave = Math.cos(elapsed / 1_700 + phase * 1.23);
  const verticalWave = Math.sin(elapsed / 1_250 + phase);
  const alpha = 0.89 + horizontalWave * 0.04 + verticalWave * 0.07;

  return {
    offsetX: horizontalWave * 0.85,
    offsetY: verticalWave * 1.45,
    scale: 0.96 + horizontalWave * 0.04 + verticalWave * 0.05,
    alpha: Math.max(0.78, Math.min(1, alpha)),
  };
}

export function buildFileLibraryStorageCloudPoints(
  segments: readonly FileLibraryStorageCloudSegment[],
  columns: number,
  rows: number,
): FileLibraryStorageCloudPoint[] {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  const pointCount = safeColumns * safeRows;
  const weighted = segments
    .map((segment, index) => ({
      segment,
      index,
      ratio: Number.isFinite(segment.ratio) && segment.ratio > 0 ? segment.ratio : 0,
    }))
    .filter((entry) => entry.ratio > 0);
  const source = weighted.length > 0 ? weighted : [{
    segment: {
      id: "available" as const,
      label: "可用空间",
      bytes: 0,
      valueLabel: "读取中",
      ratio: 1,
    },
    index: 0,
    ratio: 1,
  }];
  const totalRatio = source.reduce((sum, entry) => sum + entry.ratio, 0);
  const allocations = source.map((entry) => {
    const exact = pointCount * entry.ratio / totalRatio;
    return {
      ...entry,
      count: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let remaining = pointCount - allocations.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  for (
    const allocation of [...allocations].sort((a, b) =>
      b.remainder - a.remainder || a.index - b.index
    )
  ) {
    if (remaining <= 0) break;
    allocation.count += 1;
    remaining -= 1;
  }
  const cells = Array.from({ length: pointCount }, (_, index) => {
    const column = index % safeColumns;
    const row = Math.floor(index / safeColumns);
    const x = (column + 0.5) / safeColumns;
    const y = (row + 0.5) / safeRows;
    const wave = Math.sin(x * Math.PI * 3.1) * 0.075 +
      Math.cos(x * Math.PI * 6.4) * 0.035;
    const grain = (storageCloudNoise(index + safeColumns * 17) - 0.5) * 0.05;
    return { column, row, index, rank: y + wave + grain };
  }).sort((a, b) => a.rank - b.rank || a.index - b.index);

  let cursor = 0;
  const points: FileLibraryStorageCloudPoint[] = [];
  for (const allocation of allocations) {
    for (let index = 0; index < allocation.count; index += 1) {
      const cell = cells[cursor];
      cursor += 1;
      points.push({
        column: cell.column,
        row: cell.row,
        kind: allocation.segment.id,
        tone: storageCloudNoise(cell.index * 5 + 11),
        scale: 0.58 + storageCloudNoise(cell.index * 7 + 23) * 0.42,
      });
    }
  }

  return points;
}

export function summarizeFileLibraryHudDevices(
  items: readonly Pick<LibraryItem, "kind" | "size">[],
  source: FileLibraryHudDeviceSource | null,
): FileLibraryHudDevice[] {
  if (!source) return [];

  const localBytes = items.reduce(
    (sum, item) => item.kind === "app" ? sum : sum + normalizeStorageBytes(item.size),
    0,
  );
  const connectedNodeIds = new Set(
    source.connections.filter((connection) => connection.status === "connected")
      .map((connection) => connection.nodeId),
  );
  const onlineCatalogNodeIds = new Set(
    source.remoteFiles.filter((file) => file.availability === "online")
      .map((file) => file.nodeId),
  );
  const remoteBytes = new Map<string, number>();
  for (const file of source.remoteFiles) {
    remoteBytes.set(
      file.nodeId,
      (remoteBytes.get(file.nodeId) ?? 0) + normalizeStorageBytes(file.size),
    );
  }

  return [...source.members]
    .sort((a, b) =>
      Number(b.nodeId === source.localNodeId) -
      Number(a.nodeId === source.localNodeId)
    )
    .map((member) => {
      const local = member.nodeId === source.localNodeId;
      const bytes = local ? localBytes : remoteBytes.get(member.nodeId) ?? 0;
      const status: FileLibraryHudDevice["status"] = local
        ? "local"
        : connectedNodeIds.has(member.nodeId) ||
            onlineCatalogNodeIds.has(member.nodeId)
        ? "online"
        : "offline";
      const valueLabel = formatLibraryBytes(bytes);
      return {
        nodeId: member.nodeId,
        nodeName: member.nodeName,
        status,
        bytes,
        valueLabel,
        detail: status === "local"
          ? `本机 · ${valueLabel}`
          : status === "online"
          ? `在线 · ${valueLabel} 可见`
          : `离线 · ${valueLabel} 缓存`,
      };
    });
}

export function summarizeFileLibraryHudProgress(
  items: readonly Pick<LibraryItem, "kind" | "fingerprint">[],
): FileLibraryHudProgress {
  const files = items.filter((item) => item.kind !== "app");
  const failed = files.filter((item) => item.fingerprint?.status === "failed").length;
  const processed = files.filter((item) =>
    item.fingerprint?.status === "completed" ||
    item.fingerprint?.status === "unsupported" ||
    item.fingerprint?.status === "failed"
  ).length;
  const active = processed < files.length;
  const ratio = files.length === 0 ? 0 : processed / files.length;

  return {
    total: files.length,
    processed,
    failed,
    active,
    ratio,
    label: files.length === 0
      ? "等待导入"
      : active
      ? "相似整理中"
      : failed > 0
      ? "部分失败"
      : "整理完成",
  };
}
