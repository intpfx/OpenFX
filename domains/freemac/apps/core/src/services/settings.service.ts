import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { RelaySettingsPayload, SetupInitPayload, SetupStatus } from "@freemac/shared";
import { applyRuntimeConfig, config } from "../config";
import { loadAppSettings, saveAppSettings } from "../db/client";

let hydrated = false;

function normalizeRelayOriginInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(candidate).origin;
}

function updateRuntimeEnvFile(publicHost: string, relayOrigin?: string): boolean {
  const envFile = process.env.FREEMAC_ENV_FILE;
  if (!envFile || !existsSync(envFile)) {
    return false;
  }

  const content = readFileSync(envFile, "utf8");
  const lines = content.split("\n");
  const nextLines = new Map<string, string>();

  for (const line of lines) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    nextLines.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 1));
  }

  nextLines.set("FREEMAC_HOST", publicHost);
  if (relayOrigin !== undefined) {
    nextLines.set("FREEMAC_RELAY_ORIGIN", relayOrigin);
  }

  const output =
    lines
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex === -1) {
          return line;
        }
        const key = line.slice(0, separatorIndex);
        if (!nextLines.has(key)) {
          return line;
        }
        const value = nextLines.get(key)!;
        nextLines.delete(key);
        return `${key}=${value}`;
      })
      .concat([...nextLines.entries()].map(([key, value]) => `${key}=${value}`))
      .join("\n")
      .replace(/\n+$/, "") + "\n";

  writeFileSync(envFile, output, "utf8");
  return true;
}

function buildSetupStatus(): SetupStatus {
  const settings = loadAppSettings();
  const publicHost = settings?.publicHost || config.host;
  const publicPort = config.port;
  const relayOrigin = settings?.relayOrigin?.trim() || config.relayOrigin;

  return {
    initialized: Boolean(settings?.initializedAt && settings.passwordHash),
    hasPassword: Boolean(settings?.passwordHash),
    publicHost,
    publicPort,
    relayOrigin,
    currentListenHost: config.host,
    currentListenPort: config.port,
    restartRequired: publicHost !== config.host,
    launchdManaged: Boolean(process.env.FREEMAC_ENV_FILE),
  };
}

export async function hydrateRuntimeSettings(): Promise<void> {
  if (hydrated) {
    return;
  }

  const settings = loadAppSettings();

  applyRuntimeConfig({
    host: settings?.publicHost,
    relayOrigin: settings?.relayOrigin?.trim() ? settings.relayOrigin : config.relayOrigin,
  });

  hydrated = true;
}

export async function getSetupStatus(): Promise<SetupStatus> {
  await hydrateRuntimeSettings();
  return buildSetupStatus();
}

export async function initializeSetup(payload: SetupInitPayload): Promise<SetupStatus> {
  const passwordHash = await Bun.password.hash(payload.password);
  const initializedAt = new Date().toISOString();
  const settings = loadAppSettings();

  saveAppSettings({
    passwordHash,
    initializedAt,
    publicHost: "::",
    publicPort: config.port,
    relayOrigin: settings?.relayOrigin?.trim() || config.relayOrigin,
  });

  updateRuntimeEnvFile("::", settings?.relayOrigin?.trim() || config.relayOrigin);

  applyRuntimeConfig({ sessionPassword: payload.password });

  hydrated = true;
  return getSetupStatus();
}

export async function updateRelaySettings(payload: RelaySettingsPayload): Promise<SetupStatus> {
  const settings = loadAppSettings();
  const relayOrigin = normalizeRelayOriginInput(payload.relayOrigin);

  saveAppSettings({
    passwordHash: settings?.passwordHash || null,
    initializedAt: settings?.initializedAt || null,
    publicHost: settings?.publicHost || config.host,
    publicPort: config.port,
    relayOrigin,
  });

  applyRuntimeConfig({ relayOrigin });
  updateRuntimeEnvFile(settings?.publicHost || config.host, relayOrigin);
  return getSetupStatus();
}

export function getPasswordHash(): string | null {
  return loadAppSettings()?.passwordHash || null;
}
