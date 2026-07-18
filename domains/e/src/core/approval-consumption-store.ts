export interface ApprovalRegistration {
  readonly requestId: string;
  readonly actionId: string;
  readonly parameterFingerprint: string;
  readonly expiresAt: number;
}

export type ApprovalResolutionClaim =
  | { status: "claimed"; approval: ApprovalRegistration }
  | { status: "already_claimed"; approval: ApprovalRegistration }
  | { status: "unknown_approval" };

export type ApprovalApplicationClaim =
  | { status: "claimed"; approval: ApprovalRegistration }
  | { status: "already_claimed"; approval: ApprovalRegistration }
  | { status: "fingerprint_mismatch"; approval: ApprovalRegistration }
  | { status: "expired"; approval: ApprovalRegistration }
  | { status: "unknown_approval" };

/**
 * Persistence boundary for approval registration and one-time claims.
 *
 * Runtime adapters must make each method atomic and durable. In particular,
 * `registerIfAbsent` must never overwrite an existing approval and each claim
 * must have compare-and-set semantics across processes or isolates.
 */
export interface ApprovalConsumptionStore {
  registerIfAbsent(approval: ApprovalRegistration): ApprovalRegistration;
  claimResolution(requestId: string): ApprovalResolutionClaim;
  claimApplication(input: {
    actionId: string;
    parameterFingerprint: string;
    now: number;
  }): ApprovalApplicationClaim;
}

/**
 * Process-local compatibility store. Production runtimes that need restart or
 * multi-isolate safety must inject a durable `ApprovalConsumptionStore`.
 */
export class InMemoryApprovalConsumptionStore implements ApprovalConsumptionStore {
  readonly #byRequestId = new Map<string, ApprovalRegistration>();
  readonly #byActionId = new Map<string, ApprovalRegistration>();
  readonly #resolvedRequestIds = new Set<string>();
  readonly #appliedActionIds = new Set<string>();

  registerIfAbsent(approval: ApprovalRegistration): ApprovalRegistration {
    const existing = this.#byRequestId.get(approval.requestId) ??
      this.#byActionId.get(approval.actionId);
    if (existing) return existing;

    const registered = Object.freeze({ ...approval });
    this.#byRequestId.set(registered.requestId, registered);
    this.#byActionId.set(registered.actionId, registered);
    return registered;
  }

  claimResolution(requestId: string): ApprovalResolutionClaim {
    const approval = this.#byRequestId.get(requestId);
    if (!approval) return { status: "unknown_approval" };
    if (this.#resolvedRequestIds.has(requestId)) {
      return { status: "already_claimed", approval };
    }
    this.#resolvedRequestIds.add(requestId);
    return { status: "claimed", approval };
  }

  claimApplication(input: {
    actionId: string;
    parameterFingerprint: string;
    now: number;
  }): ApprovalApplicationClaim {
    const approval = this.#byActionId.get(input.actionId);
    if (!approval) return { status: "unknown_approval" };
    if (this.#appliedActionIds.has(input.actionId)) {
      return { status: "already_claimed", approval };
    }
    if (approval.parameterFingerprint !== input.parameterFingerprint) {
      return { status: "fingerprint_mismatch", approval };
    }
    if (input.now >= approval.expiresAt) {
      return { status: "expired", approval };
    }
    this.#appliedActionIds.add(input.actionId);
    return { status: "claimed", approval };
  }
}
