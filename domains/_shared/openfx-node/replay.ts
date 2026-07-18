import { OPENFX_NODE_ERROR_CODES, RELAY_NONCE_TTL_MS } from "./constants.ts";
import { OpenFxNodeProtocolError } from "./errors.ts";

export interface ReplayProtector {
  consume(nonce: string, timestamp: number, now: number): void;
}

export function createReplayProtector(
  nonceTtlMs = RELAY_NONCE_TTL_MS,
): ReplayProtector {
  const retained = new Map<string, number>();
  return {
    consume(nonce, timestamp, now) {
      for (const [candidate, expiresAt] of retained) {
        if (expiresAt <= now) retained.delete(candidate);
      }
      if (retained.has(nonce)) {
        throw new OpenFxNodeProtocolError(
          OPENFX_NODE_ERROR_CODES.replayDetected,
          "Authenticated nonce has already been consumed.",
        );
      }
      retained.set(nonce, Math.max(now, timestamp) + nonceTtlMs);
    },
  };
}
