import { networkInterfaces } from "node:os";
import type { DdnsState } from "@freemac/shared";
import { config } from "../config";
import { loadDdnsState, saveDdnsState } from "../db/client";
import { logger } from "../lib/logger";

const state: DdnsState = {
  currentIpv6: null,
  observedIpv6: null,
  lastUpdatedAt: null,
  status: "idle",
  errorMessage: null,
};
let hydrated = false;

function hydrateState(): void {
  if (hydrated) {
    return;
  }

  const saved = loadDdnsState();
  if (saved) {
    Object.assign(state, saved);
  }
  hydrated = true;
}

function isGlobalIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return !(
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

function normalizeIpv6(address: string): string {
  return address.trim().split("%")[0]!.toLowerCase();
}

function getLocalIpv6Candidates(): string[] {
  const interfaces = networkInterfaces();
  const candidates = new Set<string>();

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries || name.toLowerCase().includes("lo")) {
      continue;
    }

    for (const entry of entries) {
      if (entry.internal || entry.family !== "IPv6") {
        continue;
      }

      const normalized = normalizeIpv6(entry.address);
      if (isGlobalIpv6(normalized)) {
        candidates.add(normalized);
      }
    }
  }

  return [...candidates];
}

async function observePublicIpv6(): Promise<string | null> {
  for (const url of config.ddnsObservationUrls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) {
        continue;
      }

      const text = normalizeIpv6(await response.text());
      if (text.includes(":")) {
        return text;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function persistState(): void {
  saveDdnsState(state);
}

export function getDdnsState(): DdnsState {
  hydrateState();
  return state;
}

export async function runDdnsSync(): Promise<DdnsState> {
  hydrateState();
  state.status = "running";
  state.errorMessage = null;
  persistState();

  try {
    const localCandidates = getLocalIpv6Candidates();
    const observedIpv6 = await observePublicIpv6();
    const chosenIpv6 =
      observedIpv6 && localCandidates.includes(observedIpv6)
        ? observedIpv6
        : localCandidates[0] || observedIpv6;

    state.observedIpv6 = observedIpv6;

    if (!chosenIpv6) {
      throw new Error("No global IPv6 address detected");
    }

    state.currentIpv6 = chosenIpv6;
    state.lastUpdatedAt = new Date().toISOString();
    state.status = "idle";
    state.errorMessage =
      observedIpv6 && observedIpv6 !== chosenIpv6
        ? `Observed IPv6 differs from selected local IPv6: ${observedIpv6}`
        : null;
    persistState();
    logger.info("ddns", "Public IPv6 sync completed", { ipv6: chosenIpv6, observedIpv6 });
    return state;
  } catch (error) {
    state.status = "error";
    state.errorMessage = error instanceof Error ? error.message : String(error);
    persistState();
    logger.error("ddns", "DDNS sync failed", { error: state.errorMessage });
    return state;
  }
}
