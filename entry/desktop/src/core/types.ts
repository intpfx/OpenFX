import type { TelemetrySample } from "../../../../domains/_shared/openfx-node/types.ts";

export interface DesktopPreferences {
  serverUrl: string;
  nodeId: string;
  nodeName: string;
  relayEnabled: boolean;
  pairedAt: number | null;
}

export interface ProcessInfo {
  pid: number;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  command: string;
}

export interface SystemOverview extends TelemetrySample {
  topProcesses: ProcessInfo[];
}

export interface NetworkStatus {
  publicIpv6: string | null;
  ipv6Addresses: string[];
  collectedAt: number;
  observedIpv6?: string[];
  mismatch?: boolean;
  observationErrors?: string[];
}

export interface RelayStatus {
  enabled: boolean;
  paired: boolean;
  serverUrl: string;
  publicIpv6: string | null;
  lastReportedAt: number | null;
  errorMessage: string | null;
}

export interface SystemCommandOutputs {
  top: string;
  memsize: string;
  vmStat: string;
  df: string;
  netstat: string;
  battery: string;
  processes: string;
  ifconfig: string;
}

export interface ParsedSystemState {
  overview: SystemOverview;
  processes: ProcessInfo[];
  network: NetworkStatus;
}
