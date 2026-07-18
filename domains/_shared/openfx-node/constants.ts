export const PROTOCOL_VERSION = 1 as const;
export const NODE_PORT = 24_531;

export const CROCKFORD_BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_TTL_MS = 10 * 60_000;
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60_000;
export const APPROVAL_TTL_MS = 5 * 60_000;

export const TELEMETRY_SAMPLE_MS = 5_000;
export const TELEMETRY_AGGREGATE_MS = 60_000;
export const TELEMETRY_RETENTION_MS = 7 * 24 * 60 * 60_000;

export const RELAY_MAX_CLOCK_SKEW_MS = 30_000;
export const RELAY_NONCE_TTL_MS = 2 * RELAY_MAX_CLOCK_SKEW_MS;

export const OPENFX_NODE_ERROR_CODES = {
  invalidRequest: "node_invalid_request",
  unauthorized: "node_unauthorized",
  protocolMismatch: "node_protocol_mismatch",
  pairingInvalid: "node_pairing_invalid",
  pairingExpired: "node_pairing_expired",
  pairingUsed: "node_pairing_used",
  nodeOffline: "node_offline",
  nodeUnpaired: "node_unpaired",
  routeNotAllowed: "node_route_not_allowed",
  relayUnavailable: "node_relay_unavailable",
  envelopeInvalid: "node_envelope_invalid",
  timestampInvalid: "node_timestamp_invalid",
  signatureInvalid: "node_signature_invalid",
  replayDetected: "node_replay_detected",
  approvalExpired: "approval_expired",
  approvalFingerprintMismatch: "approval_fingerprint_mismatch",
  approvalAlreadyResolved: "approval_already_resolved",
  approvalAlreadyApplied: "approval_already_applied",
  internal: "node_internal_error",
} as const;

export type OpenFxNodeErrorCode =
  (typeof OPENFX_NODE_ERROR_CODES)[keyof typeof OPENFX_NODE_ERROR_CODES];
