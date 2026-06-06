import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { config } from "../config";
import type { DdnsState, SystemSnapshot } from "@freemac/shared";
import type { AuditRecord, SessionRecord } from "./schema";

export interface AppSettingsRecord {
  passwordHash: string | null;
  initializedAt: string | null;
  publicHost: string;
  publicPort: number;
  relayOrigin: string;
}

const storeDir = join(config.dataDir, "state");
const settingsPath = join(storeDir, "app-settings.json");
const ddnsStatePath = join(storeDir, "ddns-state.json");
const telemetryLatestPath = join(storeDir, "telemetry-latest.json");
const sessionsPath = join(storeDir, "sessions.json");
const approvalsPath = join(storeDir, "approvals.json");
const auditLogPath = join(storeDir, "audit.ndjson");

function ensureStoreFile(filePath: string, defaultContent: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, defaultContent, "utf8");
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tempPath, filePath);
}

export function initDb(): void {
  mkdirSync(storeDir, { recursive: true });
  ensureStoreFile(sessionsPath, "[]\n");
  ensureStoreFile(approvalsPath, "[]\n");
  ensureStoreFile(auditLogPath, "");
}

export function loadAppSettings(): AppSettingsRecord | null {
  const row = readJsonFile<AppSettingsRecord | null>(settingsPath, null);
  if (!row) {
    return null;
  }

  return {
    passwordHash: row.passwordHash,
    initializedAt: row.initializedAt,
    publicHost: row.publicHost || "::",
    publicPort: row.publicPort || 24531,
    relayOrigin: row.relayOrigin || "",
  };
}

export function saveAppSettings(settings: AppSettingsRecord): void {
  writeJsonFile(settingsPath, settings);
}

export function loadDdnsState(): DdnsState | null {
  const row = readJsonFile<DdnsState | null>(ddnsStatePath, null);
  if (!row) {
    return null;
  }

  return {
    currentIpv6: row.currentIpv6,
    observedIpv6: row.observedIpv6,
    lastUpdatedAt: row.lastUpdatedAt,
    status: row.status,
    errorMessage: row.errorMessage,
  };
}

export function saveDdnsState(state: DdnsState): void {
  writeJsonFile(ddnsStatePath, state);
}

export function loadLatestTelemetrySnapshot(): SystemSnapshot | null {
  return readJsonFile<SystemSnapshot | null>(telemetryLatestPath, null);
}

export function saveTelemetrySnapshot(snapshot: SystemSnapshot): void {
  writeJsonFile(telemetryLatestPath, snapshot);
}

function readSessions(): SessionRecord[] {
  return readJsonFile<SessionRecord[]>(sessionsPath, []);
}

function writeSessions(sessions: SessionRecord[]): void {
  writeJsonFile(sessionsPath, sessions);
}

export function createSessionRecord(session: SessionRecord): void {
  const now = new Date().toISOString();
  const sessions = readSessions().filter(
    (entry) => entry.expiresAt > now && entry.id !== session.id,
  );
  sessions.push(session);
  writeSessions(sessions);
}

export function hasActiveSessionRecord(id: string, nowIso: string): boolean {
  const sessions = readSessions();
  const validSessions = sessions.filter((entry) => entry.expiresAt > nowIso);
  if (validSessions.length !== sessions.length) {
    writeSessions(validSessions);
  }
  return validSessions.some((entry) => entry.id === id);
}

export function deleteSessionRecord(id: string): void {
  const sessions = readSessions();
  const nextSessions = sessions.filter((entry) => entry.id !== id);
  if (nextSessions.length !== sessions.length) {
    writeSessions(nextSessions);
  }
}

export function appendAuditLog(record: AuditRecord): void {
  appendFileSync(auditLogPath, `${JSON.stringify(record)}\n`, "utf8");
}

export function resetFilePersistence(): void {
  for (const filePath of [
    settingsPath,
    ddnsStatePath,
    telemetryLatestPath,
    sessionsPath,
    approvalsPath,
    auditLogPath,
  ]) {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}
