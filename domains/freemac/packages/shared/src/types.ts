export interface DdnsState {
  currentIpv6: string | null;
  observedIpv6: string | null;
  lastUpdatedAt: string | null;
  status: "idle" | "running" | "error";
  errorMessage: string | null;
}

export interface SystemSnapshot {
  collectedAt: string;
  cpuUsagePercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  networkRxMb: number;
  networkTxMb: number;
  batteryPercent: number | null;
  processCount: number;
  topProcesses: Array<{
    pid: number;
    command: string;
    cpu: number;
    memory: number;
  }>;
}

export type AgentState = "idle" | "listening" | "thinking" | "responding";

export interface AgentVisualProfile {
  state: AgentState;
  activeAgentCount: number;
  conversationDepth: number;
  lastToolExecution: string | null;
}

export interface ApprovalRequest {
  id: string;
  toolId: string;
  summary: string;
  status: "pending" | "approved" | "rejected" | "completed" | "failed";
  createdAt: string;
}

export interface AgentToolPlan {
  toolId: string;
  requiresApproval: boolean;
  reason: string;
  input: Record<string, unknown>;
}

export interface SetupStatus {
  initialized: boolean;
  hasPassword: boolean;
  publicHost: string;
  publicPort: number;
  relayOrigin: string;
  currentListenHost: string;
  currentListenPort: number;
  restartRequired: boolean;
  launchdManaged: boolean;
}

export interface SetupInitPayload {
  password: string;
}

export interface RelaySettingsPayload {
  relayOrigin: string;
}

export interface RelayReportState {
  configured: boolean;
  relayOrigin: string;
  status: "idle" | "running" | "error";
  lastReportedAt: string | null;
  errorMessage: string | null;
  lastTargetUrl: string | null;
}
