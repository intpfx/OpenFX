import type { OpenFxNodeErrorCode } from "./constants.ts";

export type NodeAvailability = "online" | "offline" | "degraded" | "unknown";

export interface NodeRecord {
  id: string;
  name: string;
  protocolVersion: number;
  publicIpv6: string;
  port: number;
  status: NodeAvailability;
  pairedAt: number;
  lastSeenAt: number;
  revokedAt?: number;
}

export interface NodeStatus {
  nodeId: string;
  availability: NodeAvailability;
  protocolVersion: number;
  publicIpv6: string;
  port: number;
  lastSeenAt: number;
  errorCode?: OpenFxNodeErrorCode;
}

export interface TelemetrySample {
  collectedAt: number;
  cpuUsagePercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  batteryPercent: number | null;
  processCount: number;
}

export interface TelemetryMinute {
  minuteStart: number;
  sampleCount: number;
  cpuUsagePercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  batteryPercent: number | null;
  processCount: number;
}

export interface AgentEvent {
  id: string;
  nodeId: string;
  type:
    | "agent.state"
    | "agent.delta"
    | "agent.tool"
    | "agent.error"
    | "agent.completed";
  payload?: unknown;
  createdAt: number;
}

export interface ApprovalRequest {
  id: string;
  nodeId: string;
  toolId: string;
  summary: string;
  parameters: Record<string, unknown>;
  parameterFingerprint: string;
  state:
    | "pending"
    | "approved"
    | "rejected"
    | "applied"
    | "expired"
    | "failed";
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
  appliedAt?: number;
  errorCode?: OpenFxNodeErrorCode;
}

export interface AuditEvent {
  id: string;
  nodeId?: string;
  category: "admin" | "pairing" | "node" | "relay" | "agent" | "approval";
  action: string;
  outcome: "succeeded" | "rejected" | "failed" | "expired" | "replayed";
  actor?: string;
  subjectId?: string;
  errorCode?: OpenFxNodeErrorCode;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface RelaySettings {
  enabled: boolean;
  origin: string | null;
  updatedAt: number;
}

export interface SealedRelayEnvelope {
  version: 1;
  timestamp: number;
  nonce: string;
  iv: string;
  ciphertext: string;
  signature: string;
}

export interface SignedNodeRequest {
  version: 1;
  method: string;
  path: string;
  body: unknown;
  bodyDigest: string;
  timestamp: number;
  nonce: string;
  signature: string;
}
