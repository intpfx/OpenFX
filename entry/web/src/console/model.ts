export type ConsoleModuleId =
  | "overview"
  | "mac"
  | "relay"
  | "agent"
  | "access"
  | "database"
  | "audit"
  | "settings";

export const CONSOLE_CLIENT_POLICY = {
  credentials: "same-origin",
  persistAdministratorCredential: false,
  persistNodeCredential: false,
} as const;

export const CONSOLE_ENDPOINTS = {
  pairings: "/api/console/pairings",
  node: "/api/console/node",
} as const;

export const CONSOLE_MODULES: ReadonlyArray<{
  id: ConsoleModuleId;
  label: string;
  glyph: string;
}> = [
  { id: "overview", label: "核心总览", glyph: "core" },
  { id: "mac", label: "Mac 主机", glyph: "mac" },
  { id: "relay", label: "远程接入", glyph: "relay" },
  { id: "agent", label: "Agent", glyph: "agent" },
  { id: "access", label: "访问规则", glyph: "access" },
  { id: "database", label: "数据库", glyph: "database" },
  { id: "audit", label: "审计", glyph: "audit" },
  { id: "settings", label: "设置", glyph: "settings" },
] as const;

export type NodeAvailability =
  | "online"
  | "degraded"
  | "offline"
  | "unknown";

export type CoreRendererCapabilities = {
  reducedMotion: boolean;
  lowPower: boolean;
  narrowViewport: boolean;
  canvasAvailable: boolean;
  rendererFailed: boolean;
};

export function selectCoreRenderer(
  capabilities: CoreRendererCapabilities,
): "canvas" | "static" {
  return capabilities.reducedMotion || capabilities.lowPower ||
      capabilities.narrowViewport || !capabilities.canvasAvailable ||
      capabilities.rendererFailed
    ? "static"
    : "canvas";
}

export function corePresentation(availability: NodeAvailability): {
  label: string;
  tone: NodeAvailability;
  pulseSeconds: number;
} {
  switch (availability) {
    case "online":
      return { label: "在线", tone: "online", pulseSeconds: 4.8 };
    case "degraded":
      return { label: "连接异常", tone: "degraded", pulseSeconds: 7.2 };
    case "offline":
      return { label: "离线", tone: "offline", pulseSeconds: 12 };
    default:
      return { label: "等待节点", tone: "unknown", pulseSeconds: 9 };
  }
}

export function formatBytes(value: number | null | undefined): string {
  if (!Number.isFinite(value) || !value || value < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function formatTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString("zh-CN");
}

export function relayUpdateMessage(
  result: { approvalRequired?: boolean },
  enabled: boolean,
): string {
  if (result.approvalRequired) {
    return `${enabled ? "启用" : "停用"}请求等待审批`;
  }
  return enabled ? "远程接入已启用" : "远程接入已停用";
}
