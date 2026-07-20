import { TELEMETRY_AGGREGATE_MS } from "../../../../domains/_shared/openfx-node/constants.ts";
import type { ParsedSystemState, RelayStatus } from "../core/types.ts";
import type { RestoredPairing } from "./pairing-service.ts";
import type { ControlPlaneClient } from "./control-plane-client.ts";

export interface RelayReporter {
  setPairing(pairing: RestoredPairing | null): void;
  status(): RelayStatus;
  report(state: ParsedSystemState): Promise<void>;
}

export interface RelayReporterOptions {
  now?: () => number;
  reportIntervalMs?: number;
}

export const createRelayReporter = (
  client: Pick<ControlPlaneClient, "heartbeat" | "telemetry">,
  options: RelayReporterOptions = {},
): RelayReporter => {
  const now = options.now ?? Date.now;
  const reportIntervalMs = options.reportIntervalMs ?? TELEMETRY_AGGREGATE_MS;
  let pairing: RestoredPairing | null = null;
  let lastAttemptedAt: number | null = null;
  let lastReportedAt: number | null = null;
  let errorMessage: string | null = null;
  let currentIpv6: string | null = null;
  return {
    setPairing(next) {
      pairing = next;
      lastAttemptedAt = null;
      lastReportedAt = null;
      errorMessage = null;
    },
    status() {
      return {
        enabled: pairing?.preferences.relayEnabled ?? false,
        paired: pairing !== null,
        serverUrl: pairing?.preferences.serverUrl ?? "",
        publicIpv6: currentIpv6,
        lastReportedAt,
        errorMessage,
      };
    },
    async report(state) {
      currentIpv6 = state.network.publicIpv6;
      if (!pairing || !pairing.preferences.relayEnabled || !currentIpv6) return;
      const attemptedAt = now();
      if (
        lastAttemptedAt !== null &&
        attemptedAt - lastAttemptedAt < reportIntervalMs
      ) return;
      lastAttemptedAt = attemptedAt;
      const activePairing = pairing;
      const auth = {
        serverUrl: activePairing.preferences.serverUrl,
        nodeId: activePairing.preferences.nodeId,
        nodeSecret: activePairing.nodeSecret,
      };
      try {
        // Perry's native promise scheduler can lose the second native I/O
        // branch when two signed HTTPS requests start in the same Promise.all.
        // The minute cadence does not need concurrency, so preserve ordering.
        await client.heartbeat({
          ...auth,
          publicIpv6: currentIpv6,
          availability: "online",
        });
        await client.telemetry({ ...auth, sample: state.overview });
        if (pairing === activePairing) {
          lastReportedAt = now();
          errorMessage = null;
        }
      } catch (error) {
        if (pairing === activePairing) {
          errorMessage = error instanceof Error ? error.message : String(error);
        }
      }
    },
  };
};
