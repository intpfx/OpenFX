import type { LocalDirectorySourceSnapshot } from "./local-directory-source.ts";

export type BloubControlState = Readonly<{
  action: "import" | "connect" | "show-directory" | "show-opfs" | "wait";
  glyph: "idle" | "thinking" | "orbit" | "swirl" | "alert";
  label: string;
}>;

export function resolveBloubControlState(input: {
  busy: boolean;
  sourceMode: "opfs" | "directory";
  localDirectoryStatus: LocalDirectorySourceSnapshot["status"];
}): BloubControlState {
  if (input.busy) {
    return { action: "wait", glyph: "swirl", label: "正在导入" };
  }
  if (input.localDirectoryStatus === "unsupported") {
    return { action: "import", glyph: "idle", label: "导入照片或文件" };
  }
  if (input.localDirectoryStatus === "scanning") {
    return { action: "wait", glyph: "thinking", label: "正在读取本地文件夹" };
  }
  if (
    input.localDirectoryStatus === "error" ||
    input.localDirectoryStatus === "permission-required"
  ) {
    return { action: "connect", glyph: "alert", label: "重新连接本地文件夹" };
  }
  if (input.sourceMode === "directory") {
    return { action: "show-opfs", glyph: "orbit", label: "切换到 OPFS" };
  }
  if (input.localDirectoryStatus === "ready") {
    return {
      action: "show-directory",
      glyph: "idle",
      label: "切换到本地文件夹",
    };
  }
  return { action: "connect", glyph: "idle", label: "连接本地文件夹" };
}

export function resolveNebulaSearchState(input: {
  focused: boolean;
  query: string;
  resultCount: number;
}): "breathing" | "listening" | "sweep" | "shake" {
  if (!input.query.trim()) return input.focused ? "listening" : "breathing";
  return input.resultCount > 0 ? "sweep" : "shake";
}
