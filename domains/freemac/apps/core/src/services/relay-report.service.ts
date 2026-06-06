import type { RelayReportState } from "@freemac/shared";
import { config } from "../config";
import { logger } from "../lib/logger";
import { getDdnsState } from "./ddns.service";

const relayState: RelayReportState = {
  configured: false,
  relayOrigin: "",
  status: "idle",
  lastReportedAt: null,
  errorMessage: null,
  lastTargetUrl: null,
};

function normalizeRelayOrigin(value: string): string {
  if (!value) {
    return "";
  }
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  return url.origin;
}

function buildTargetUrl(): string | null {
  const ddns = getDdnsState();
  if (!ddns.currentIpv6) {
    return null;
  }
  return `http://[${ddns.currentIpv6}]:${config.port}`;
}

export function syncRelayConfig(): void {
  relayState.relayOrigin = config.relayOrigin;
  relayState.configured = Boolean(config.relayOrigin);
}

export function getRelayReportState(): RelayReportState {
  syncRelayConfig();
  return relayState;
}

export async function reportRelayTarget(): Promise<RelayReportState> {
  syncRelayConfig();

  if (!relayState.configured) {
    relayState.status = "idle";
    relayState.errorMessage = null;
    relayState.lastTargetUrl = null;
    return relayState;
  }

  const ddns = getDdnsState();
  if (!ddns.currentIpv6) {
    relayState.status = "error";
    relayState.errorMessage = "No public IPv6 detected yet";
    relayState.lastTargetUrl = null;
    return relayState;
  }

  relayState.status = "running";
  relayState.errorMessage = null;

  const targetUrl = buildTargetUrl();
  try {
    const relayOrigin = normalizeRelayOrigin(config.relayOrigin);
    const response = await fetch(`${relayOrigin}/api/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.relayReportToken ? { Authorization: `Bearer ${config.relayReportToken}` } : {}),
      },
      body: JSON.stringify({
        ipv6: ddns.currentIpv6,
        port: config.port,
        protocol: "http",
        source: "freemac-local",
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Relay report failed with ${response.status}: ${text || response.statusText}`,
      );
    }

    relayState.status = "idle";
    relayState.lastReportedAt = new Date().toISOString();
    relayState.lastTargetUrl = targetUrl;
    relayState.errorMessage = null;
    logger.info("relay", "Reported target to Deno Deploy relay", {
      relayOrigin,
      targetUrl,
    });
    return relayState;
  } catch (error) {
    relayState.status = "error";
    relayState.errorMessage = error instanceof Error ? error.message : String(error);
    relayState.lastTargetUrl = targetUrl;
    logger.error("relay", "Relay report failed", {
      error: relayState.errorMessage,
      relayOrigin: config.relayOrigin,
      targetUrl,
    });
    return relayState;
  }
}
