export const FILE_WALL_WIDTH = 820;
export const FILE_WALL_HEIGHT = 640;

const SPARSE_FILE_LIMIT = 6;
const SPARSE_COLUMNS = 3;
const SPARSE_TILE_WIDTH = 200;
const SPARSE_TILE_HEIGHT = 150;

export interface FileWallRowLayout {
  itemOffset: number;
  itemCount: number;
  height: number;
  itemWidths: number[];
  gap: number;
  fillsWidth: boolean;
}

export function fileWallBackgroundAlpha(
  requestedItemCount: number,
): number {
  const totalItems = Number.isFinite(requestedItemCount)
    ? Math.max(0, Math.floor(requestedItemCount))
    : 0;
  return totalItems <= SPARSE_FILE_LIMIT ? 0 : 1;
}

export function fileWallLayout(
  requestedItemCount: number,
): FileWallRowLayout[] {
  const totalItems = Number.isFinite(requestedItemCount)
    ? Math.max(0, Math.floor(requestedItemCount))
    : 0;
  if (totalItems === 0) return [];
  if (totalItems <= SPARSE_FILE_LIMIT) return sparseLayout(totalItems);

  const fillsSingleViewport = totalItems <= 24;
  const rowCount = fillsSingleViewport
    ? viewportRowCount(totalItems)
    : Math.ceil(totalItems / 6);
  const rowHeight = fillsSingleViewport
    ? FILE_WALL_HEIGHT / rowCount
    : FILE_WALL_HEIGHT / 4;
  const balancedBase = fillsSingleViewport ? Math.floor(totalItems / rowCount) : 6;
  const balancedExtra = fillsSingleViewport ? totalItems % rowCount : 0;
  const rows: FileWallRowLayout[] = [];
  let itemOffset = 0;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const remaining = totalItems - itemOffset;
    const itemCount = fillsSingleViewport
      ? balancedBase + (rowIndex < balancedExtra ? 1 : 0)
      : Math.min(6, remaining);
    const itemWidths: number[] = [];
    for (let slot = 0; slot < itemCount; slot += 1) {
      itemWidths.push(tileWidth(itemCount, rowIndex % 3, slot));
    }
    rows.push({
      itemOffset,
      itemCount,
      height: rowHeight,
      itemWidths,
      gap: 0,
      fillsWidth: true,
    });
    itemOffset += itemCount;
  }

  return rows;
}

function sparseLayout(totalItems: number): FileWallRowLayout[] {
  const rows: FileWallRowLayout[] = [];
  let itemOffset = 0;
  while (itemOffset < totalItems) {
    const itemCount = Math.min(SPARSE_COLUMNS, totalItems - itemOffset);
    rows.push({
      itemOffset,
      itemCount,
      height: SPARSE_TILE_HEIGHT,
      itemWidths: Array(itemCount).fill(SPARSE_TILE_WIDTH),
      gap: 0,
      fillsWidth: false,
    });
    itemOffset += itemCount;
  }
  return rows;
}

function viewportRowCount(itemCount: number): number {
  if (itemCount <= 2) return 1;
  if (itemCount <= 6) return 2;
  if (itemCount <= 12) return 3;
  return 4;
}

function tileWidth(
  itemCount: number,
  pattern: number,
  slot: number,
): number {
  if (itemCount === 1) return FILE_WALL_WIDTH;
  if (itemCount === 2) {
    if (pattern === 0) return slot === 0 ? 450 : 370;
    if (pattern === 1) return slot === 0 ? 370 : 450;
    return 410;
  }
  if (itemCount === 3) {
    if (pattern === 0) {
      if (slot === 0) return 220;
      if (slot === 1) return 340;
      return 260;
    }
    if (pattern === 1) return slot === 1 ? 220 : 300;
    return slot === 1 ? 320 : 250;
  }
  if (itemCount === 4) {
    if (pattern === 0) {
      if (slot === 0) return 150;
      if (slot === 1) return 208;
      if (slot === 2) return 256;
      return 206;
    }
    if (pattern === 1) return slot === 0 || slot === 3 ? 238 : 172;
    if (slot === 0 || slot === 2) return 192;
    if (slot === 1) return 248;
    return 188;
  }
  if (itemCount === 5) {
    if (pattern === 0) {
      if (slot === 0) return 126;
      if (slot === 1) return 164;
      if (slot === 2) return 178;
      if (slot === 3) return 146;
      return 206;
    }
    if (pattern === 1) {
      if (slot === 0 || slot === 4) return 172;
      if (slot === 1) return 132;
      if (slot === 2) return 190;
      return 154;
    }
    if (slot === 0) return 148;
    if (slot === 1) return 190;
    if (slot === 2) return 126;
    if (slot === 3) return 174;
    return 182;
  }
  if (pattern === 0) {
    if (slot === 0) return 96;
    if (slot === 1) return 142;
    if (slot === 2) return 132;
    if (slot === 3) return 156;
    if (slot === 4) return 138;
    return 156;
  }
  if (pattern === 1) {
    if (slot === 0) return 138;
    if (slot === 1) return 118;
    if (slot === 2) return 164;
    if (slot === 3) return 126;
    if (slot === 4) return 150;
    return 124;
  }
  if (slot === 0) return 118;
  if (slot === 1) return 156;
  if (slot === 2) return 108;
  if (slot === 3) return 150;
  if (slot === 4) return 132;
  return 156;
}
