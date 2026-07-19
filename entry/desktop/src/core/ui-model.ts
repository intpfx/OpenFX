import type { PairingNetworkState } from "./pairing-readiness.ts";
import type { DesktopPreferences } from "./types.ts";

export type CoreMotion = "animated" | "static";

export interface DesktopUiSnapshotInput {
  preferences: DesktopPreferences;
  network?: PairingNetworkState | null;
  serviceStatus?: string | null;
  monitorStatus?: string | null;
  pairingError?: unknown;
  pairingInProgress: boolean;
  paired: boolean;
}

export interface DesktopUiSnapshot {
  appTitle: string;
  nodeName: string;
  pairingState: string;
  pairingDetail: string;
  serverStatus: string;
  networkStatus: string;
  relayStatus: string;
  launchModeStatus: string;
  motionStatus: string;
  coreMotion: CoreMotion;
  serviceStatus: string;
  monitorStatus: string;
  errorMessage: string;
  primaryAction: string;
}

export const createDesktopUiSnapshot = (
  input: DesktopUiSnapshotInput,
): DesktopUiSnapshot => {
  const paired = input.paired;
  const reduceMotion = input.preferences.reduceMotion;
  return {
    appTitle: "OpenFX Node",
    nodeName: input.preferences.nodeName || "OpenFX Mac",
    pairingState: paired ? "已配对" : "等待配对",
    pairingDetail: paired
      ? `节点 ID：${input.preferences.nodeId}`
      : "输入控制台 HTTPS 地址和 8 位配对码。",
    serverStatus: input.preferences.serverUrl || "尚未设置服务端",
    networkStatus: input.network?.publicIpv6 || "未检测到公网 IPv6",
    relayStatus: input.preferences.relayEnabled ? "Relay 已启用" : "Relay 已停用",
    launchModeStatus: input.preferences.launchMode === "menuBarOnly"
      ? "仅菜单栏模式（下次启动生效）"
      : "常规模式（Dock 与菜单栏）",
    motionStatus: reduceMotion ? "静态核心" : "动态核心",
    coreMotion: reduceMotion ? "static" : "animated",
    serviceStatus: nonempty(input.serviceStatus, "节点服务准备中"),
    monitorStatus: nonempty(input.monitorStatus, "等待系统采样"),
    errorMessage: input.pairingError === undefined || input.pairingError === null
      ? ""
      : describeDesktopError(input.pairingError),
    primaryAction: input.pairingInProgress ? "正在配对…" : paired ? "已配对" : "配对",
  };
};

export const describeDesktopError = (error: unknown): string => {
  const code = error instanceof Error ? error.message : String(error);
  const normalized = code.toLowerCase();

  if (normalized === "https_required" || normalized.includes("invalid url")) {
    return "服务端地址无效，请输入 HTTPS 地址。";
  }
  if (
    normalized.includes("keychain") ||
    normalized.includes("钥匙串") ||
    normalized.includes("security command") ||
    normalized.includes("security_exit_") ||
    normalized.includes("/usr/bin/security")
  ) {
    return "无法安全保存节点凭据，请检查 macOS 钥匙串权限。";
  }
  if (
    normalized === "public_ipv6_required" ||
    normalized === "public_ipv6_mismatch" ||
    normalized === "public_ipv6_unavailable"
  ) {
    return "未检测到与外部观察一致的公网 IPv6，请检查网络后重试。";
  }
  if (normalized === "node_pairing_expired") {
    return "配对码已过期，请在控制台重新生成。";
  }
  if (normalized === "node_pairing_used") {
    return "配对码已使用，请在控制台重新生成。";
  }
  if (normalized === "node_pairing_invalid") {
    return "配对码无效，请在控制台重新生成。";
  }
  if (normalized === "node_protocol_mismatch") {
    return "节点与控制台协议不兼容，请更新 OpenFX Node。";
  }
  if (normalized === "preferences_rollback_failed") {
    return "本地偏好写入失败且无法确认回滚结果，请重启应用后检查设置。";
  }
  if (
    normalized === "network_failure" ||
    normalized.includes("fetch failed") ||
    normalized.includes("econnrefused") ||
    normalized.includes("econnreset") ||
    normalized.includes("enotfound") ||
    normalized.includes("etimedout") ||
    normalized.includes("ehostunreach") ||
    normalized.includes("socket hang up")
  ) {
    return "网络连接失败，请检查服务端地址与网络后重试。";
  }
  return "操作失败，请稍后重试。";
};

const nonempty = (value: string | null | undefined, fallback: string): string =>
  value?.trim() || fallback;
