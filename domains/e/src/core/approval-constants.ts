export const APPROVAL_TTL_MS = 5 * 60_000;

export const APPROVAL_ERROR_CODES = {
  expired: "approval_expired",
  fingerprintMismatch: "approval_fingerprint_mismatch",
  alreadyResolved: "approval_already_resolved",
  alreadyApplied: "approval_already_applied",
  notApproved: "approval_not_approved",
  notRegistered: "approval_not_registered",
} as const;

export type ApprovalErrorCode =
  (typeof APPROVAL_ERROR_CODES)[keyof typeof APPROVAL_ERROR_CODES];
