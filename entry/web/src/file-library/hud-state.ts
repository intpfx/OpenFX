import type { LibraryItem } from "./model.ts";

export type FileLibraryHudProgress = {
  total: number;
  processed: number;
  failed: number;
  active: boolean;
  ratio: number;
  label: "等待导入" | "查重中" | "部分失败" | "查重完成";
};

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
      ? "查重中"
      : failed > 0
      ? "部分失败"
      : "查重完成",
  };
}
