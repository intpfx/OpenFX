import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  webDistPath: string;
  dataDir: string;
  sessionPassword: string;
  sseHeartbeatMs: number;
  wsHeartbeatMs: number;
  ddnsIntervalMs: number;
  telemetryIntervalMs: number;
  ddnsObservationUrls: string[];
  relayOrigin: string;
  relayReportIntervalMs: number;
  relayReportToken: string;
}

function resolveDataDir(): string {
  const dir = process.env.FREEMAC_DATA_DIR || resolve(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const dataDir = resolveDataDir();

export const config: AppConfig = {
  host: process.env.FREEMAC_HOST || "127.0.0.1",
  port: 24531,
  webDistPath: process.env.FREEMAC_WEB_DIST || resolve(process.cwd(), "../web/dist"),
  dataDir,
  sessionPassword: process.env.FREEMAC_PASSWORD || "changeme123",
  sseHeartbeatMs: Number(process.env.FREEMAC_SSE_HEARTBEAT_MS || 10000),
  wsHeartbeatMs: Number(process.env.FREEMAC_WS_HEARTBEAT_MS || 5000),
  ddnsIntervalMs: Number(process.env.FREEMAC_DDNS_INTERVAL_MS || 5 * 60 * 1000),
  telemetryIntervalMs: Number(process.env.FREEMAC_TELEMETRY_INTERVAL_MS || 5 * 1000),
  ddnsObservationUrls: (
    process.env.FREEMAC_DDNS_OBSERVATION_URLS ||
    "https://api64.ipify.org,https://ipv6.icanhazip.com"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  relayOrigin: process.env.FREEMAC_RELAY_ORIGIN || "",
  relayReportIntervalMs: Number(process.env.FREEMAC_RELAY_REPORT_INTERVAL_MS || 60 * 1000),
  relayReportToken: process.env.FREEMAC_RELAY_REPORT_TOKEN || "",
};

export function applyRuntimeConfig(
  input: Partial<Pick<AppConfig, "host" | "sessionPassword" | "relayOrigin">>,
): void {
  if (input.host !== undefined) {
    config.host = input.host;
  }
  if (input.sessionPassword !== undefined) {
    config.sessionPassword = input.sessionPassword;
  }
  if (input.relayOrigin !== undefined) {
    config.relayOrigin = input.relayOrigin;
  }
}
