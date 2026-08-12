export type LibraryGridColumns = 2 | 3 | 4 | 5;

const MIN_COLUMNS: LibraryGridColumns = 2;
const MAX_COLUMNS: LibraryGridColumns = 5;

export function clampLibraryGridColumns(value: number): LibraryGridColumns {
  return Math.min(
    MAX_COLUMNS,
    Math.max(MIN_COLUMNS, Math.round(value)),
  ) as LibraryGridColumns;
}

export function parseLibraryGridColumns(value: unknown): LibraryGridColumns {
  if (value === null || value === undefined || value === "") return 3;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? clampLibraryGridColumns(parsed) : 3;
}

export function resolveLibraryGridColumnsFromPinch(
  initialColumns: LibraryGridColumns,
  scale: number,
): LibraryGridColumns {
  if (!Number.isFinite(scale) || scale <= 0) return initialColumns;
  const columnDelta = Math.round(Math.log(scale) / Math.log(1.18));
  return clampLibraryGridColumns(initialColumns - columnDelta);
}
