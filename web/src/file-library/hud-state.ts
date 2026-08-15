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

export type FileLibraryStorageTileId =
  | "available"
  | "video"
  | "image"
  | "live-photo"
  | "document"
  | "audio"
  | "other";

export type FileLibraryStorageTile = {
  id: FileLibraryStorageTileId;
  label: string;
  bytes: number;
  valueLabel: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  emphasis: "large" | "medium" | "small";
};

export type FileLibraryStorageHeatmap = {
  summary: FileLibraryStorageSummary | null;
  tiles: FileLibraryStorageTile[];
};

type FileLibraryStorageCategory = Exclude<FileLibraryStorageTileId, "available">;

type WeightedStorageTile = {
  id: FileLibraryStorageCategory;
  label: string;
  bytes: number;
};

type StorageRect = FileLibraryStorageTile["rect"];

const STORAGE_CATEGORY_LABELS: Record<FileLibraryStorageCategory, string> = {
  video: "视频",
  image: "照片",
  "live-photo": "实况照片",
  document: "文档",
  audio: "音频",
  other: "其他",
};

const STORAGE_CATEGORY_ORDER = Object.keys(
  STORAGE_CATEGORY_LABELS,
) as FileLibraryStorageCategory[];

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

function getStorageCategory(
  kind: LibraryItem["kind"],
): FileLibraryStorageCategory | null {
  if (kind === "app") return null;
  if (kind === "video") return "video";
  if (kind === "image") return "image";
  if (kind === "live-photo") return "live-photo";
  if (kind === "pdf" || kind === "text") return "document";
  if (kind === "audio") return "audio";
  return "other";
}

function splitStorageTiles(
  tiles: readonly WeightedStorageTile[],
): [WeightedStorageTile[], WeightedStorageTile[]] {
  const total = tiles.reduce((sum, tile) => sum + tile.bytes, 0);
  let running = 0;
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < tiles.length; index += 1) {
    running += tiles[index - 1].bytes;
    const distance = Math.abs(total / 2 - running);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }

  return [tiles.slice(0, bestIndex), tiles.slice(bestIndex)];
}

function layoutStorageTiles(
  tiles: readonly WeightedStorageTile[],
  rect: StorageRect,
): Array<WeightedStorageTile & { rect: StorageRect }> {
  if (tiles.length === 0) return [];
  if (tiles.length === 1) return [{ ...tiles[0], rect }];

  const [first, second] = splitStorageTiles(tiles);
  const firstBytes = first.reduce((sum, tile) => sum + tile.bytes, 0);
  const totalBytes = firstBytes + second.reduce((sum, tile) => sum + tile.bytes, 0);
  const ratio = totalBytes > 0 ? firstBytes / totalBytes : 0.5;
  const splitVertically = rect.width >= rect.height;

  if (splitVertically) {
    const firstWidth = rect.width * ratio;
    return [
      ...layoutStorageTiles(first, { ...rect, width: firstWidth }),
      ...layoutStorageTiles(second, {
        x: rect.x + firstWidth,
        y: rect.y,
        width: rect.width - firstWidth,
        height: rect.height,
      }),
    ];
  }

  const firstHeight = rect.height * ratio;
  return [
    ...layoutStorageTiles(first, { ...rect, height: firstHeight }),
    ...layoutStorageTiles(second, {
      x: rect.x,
      y: rect.y + firstHeight,
      width: rect.width,
      height: rect.height - firstHeight,
    }),
  ];
}

function getStorageTileEmphasis(rect: StorageRect): FileLibraryStorageTile["emphasis"] {
  const area = rect.width * rect.height / 10_000;
  if (area >= 0.16) return "large";
  if (area >= 0.035) return "medium";
  return "small";
}

function getStorageHeatmapUsageRatio(usage: number, quota: number): number {
  if (quota <= 0 || usage <= 0) return 0;
  if (usage >= quota) return 1;
  return Math.min(0.84, Math.max(0.32, usage / quota));
}

export function summarizeFileLibraryStorageHeatmap(
  items: readonly Pick<LibraryItem, "kind" | "size">[],
  storage: StorageEstimate | null,
): FileLibraryStorageHeatmap {
  const summary = summarizeFileLibraryStorage(storage);
  if (!summary || !storage || normalizeStorageBytes(storage.quota) === 0) {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    return {
      summary,
      tiles: [{
        id: "available",
        label: "可用空间",
        bytes: 0,
        valueLabel: "读取中",
        rect,
        emphasis: "large",
      }],
    };
  }

  const quota = normalizeStorageBytes(storage.quota);
  const usage = Math.min(normalizeStorageBytes(storage.usage), quota);
  const available = Math.max(0, quota - usage);
  const categoryBytes = new Map<FileLibraryStorageCategory, number>(
    STORAGE_CATEGORY_ORDER.map((category) => [category, 0]),
  );

  for (const item of items) {
    const category = getStorageCategory(item.kind);
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
    for (const category of STORAGE_CATEGORY_ORDER) {
      categoryBytes.set(category, (categoryBytes.get(category) ?? 0) * scale);
    }
  }

  const weightedCategories = STORAGE_CATEGORY_ORDER
    .map((id) => ({
      id,
      label: STORAGE_CATEGORY_LABELS[id],
      bytes: categoryBytes.get(id) ?? 0,
    }))
    .filter((tile) => tile.bytes > 0);
  const heatmapUsageRatio = getStorageHeatmapUsageRatio(usage, quota);
  const availableWidth = (1 - heatmapUsageRatio) * 100;
  const availableRect = {
    x: 0,
    y: 0,
    width: availableWidth,
    height: 100,
  };
  const categoryRects = layoutStorageTiles(weightedCategories, {
    x: availableWidth,
    y: 0,
    width: 100 - availableWidth,
    height: 100,
  });
  const tiles: FileLibraryStorageTile[] = [];

  if (available > 0) {
    tiles.push({
      id: "available",
      label: "可用空间",
      bytes: available,
      valueLabel: formatLibraryBytes(available),
      rect: availableRect,
      emphasis: getStorageTileEmphasis(availableRect),
    });
  }
  tiles.push(...categoryRects.map((tile) => ({
    ...tile,
    valueLabel: formatLibraryBytes(tile.bytes),
    emphasis: getStorageTileEmphasis(tile.rect),
  })));

  return { summary, tiles };
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
