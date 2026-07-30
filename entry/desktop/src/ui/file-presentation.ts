import type { FileLibraryKind } from "../native/file-library.ts";

export type FileOpenPresentation =
  | "immersive-image"
  | "immersive-video"
  | "details";

export function fileDisplayTitle(name: string): string {
  const normalized = name.trim();
  const extensionIndex = normalized.lastIndexOf(".");
  const base = extensionIndex > 0 ? normalized.slice(0, extensionIndex) : normalized;
  if (base.length <= 34) return base;
  return `${base.slice(0, 33)}…`;
}

export function fileOpenPresentation(
  kind: FileLibraryKind,
): FileOpenPresentation {
  if (kind === "image") return "immersive-image";
  if (kind === "video") return "immersive-video";
  return "details";
}
