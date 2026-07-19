import type { ParsedSystemState, RelayStatus } from "../core/types.ts";
import type { RestoredPairing } from "./pairing-service.ts";
import type { ControlPlaneClient } from "./control-plane-client.ts";

export interface RelayReporter {
  setPairing(pairing: RestoredPairing | null): void;
  status(): RelayStatus;
  report(state: ParsedSystemState): Promise<void>;
}

export const createRelayReporter = (
  client: Pick<ControlPlaneClient, "heartbeat" | "telemetry">,
): RelayReporter => {
  let pairing: RestoredPairing | null = null;
  let lastReportedAt: number | null = null;
  let errorMessage: string | null = null;
  let currentIpv6: string | null = null;
  return {
    setPairing(next) {
      pairing = next;
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
      const auth = {
        serverUrl: pairing.preferences.serverUrl,
        nodeId: pairing.preferences.nodeId,
        nodeSecret: pairing.nodeSecret,
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
        lastReportedAt = Date.now();
        errorMessage = null;
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    },
  };
};
