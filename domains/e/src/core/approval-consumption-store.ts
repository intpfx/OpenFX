export interface ApprovalRegistrationInput {
  readonly requestId: string;
  readonly actionId: string;
  readonly parameterFingerprint: string;
  readonly expiresAt: number;
}

export interface ApprovalRegistration extends ApprovalRegistrationInput {
  readonly resolution: "pending" | "approved" | "rejected";
}

export type ApprovalResolutionClaim =
  | { status: "claimed"; approval: ApprovalRegistration }
  | { status: "already_claimed"; approval: ApprovalRegistration }
  | { status: "fingerprint_mismatch"; approval: ApprovalRegistration }
  | { status: "expired"; approval: ApprovalRegistration }
  | { status: "unknown_approval" };

export type ApprovalApplicationClaim =
  | { status: "claimed"; approval: ApprovalRegistration }
  | { status: "already_claimed"; approval: ApprovalRegistration }
  | { status: "fingerprint_mismatch"; approval: ApprovalRegistration }
  | { status: "expired"; approval: ApprovalRegistration }
  | { status: "not_approved"; approval: ApprovalRegistration }
  | { status: "unknown_approval" };

/**
 * Persistence boundary for approval registration and one-time claims.
 *
 * Runtime adapters must make each method atomic and durable. In particular,
 * `registerIfAbsent` must never overwrite an existing approval and each claim
 * must have compare-and-set semantics across processes or isolates.
 * `claimResolution` must persist its approved/rejected outcome in the same
 * transaction; `claimApplication` may succeed only for an approved outcome.
 */
export interface ApprovalConsumptionStore {
  registerIfAbsent(
    approval: ApprovalRegistrationInput,
  ): Promise<ApprovalRegistration>;
  claimResolution(input: {
    requestId: string;
    resolution: "approved" | "rejected";
    parameterFingerprint: string;
    now: number;
  }): Promise<ApprovalResolutionClaim>;
  claimApplication(input: {
    actionId: string;
    parameterFingerprint: string;
    now: number;
  }): Promise<ApprovalApplicationClaim>;
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

  registerIfAbsent(
    approval: ApprovalRegistrationInput,
  ): Promise<ApprovalRegistration> {
    const existing = this.#byRequestId.get(approval.requestId) ??
      this.#byActionId.get(approval.actionId);
    if (existing) return Promise.resolve(existing);

    const registered = Object.freeze({ ...approval, resolution: "pending" as const });
    this.#byRequestId.set(registered.requestId, registered);
    this.#byActionId.set(registered.actionId, registered);
    return Promise.resolve(registered);
  }

  claimResolution(input: {
    requestId: string;
    resolution: "approved" | "rejected";
    parameterFingerprint: string;
    now: number;
  }): Promise<ApprovalResolutionClaim> {
    const approval = this.#byRequestId.get(input.requestId);
    if (!approval) return Promise.resolve({ status: "unknown_approval" });
    if (this.#resolvedRequestIds.has(input.requestId)) {
      return Promise.resolve({ status: "already_claimed", approval });
    }
    if (approval.parameterFingerprint !== input.parameterFingerprint) {
      return Promise.resolve({ status: "fingerprint_mismatch", approval });
    }
    if (input.now >= approval.expiresAt) {
      return Promise.resolve({ status: "expired", approval });
    }

    const resolved = Object.freeze({ ...approval, resolution: input.resolution });
    this.#resolvedRequestIds.add(input.requestId);
    this.#byRequestId.set(resolved.requestId, resolved);
    this.#byActionId.set(resolved.actionId, resolved);
    return Promise.resolve({ status: "claimed", approval: resolved });
  }

  claimApplication(input: {
    actionId: string;
    parameterFingerprint: string;
    now: number;
  }): Promise<ApprovalApplicationClaim> {
    const approval = this.#byActionId.get(input.actionId);
    if (!approval) return Promise.resolve({ status: "unknown_approval" });
    if (approval.resolution !== "approved") {
      return Promise.resolve({ status: "not_approved", approval });
    }
    if (this.#appliedActionIds.has(input.actionId)) {
      return Promise.resolve({ status: "already_claimed", approval });
    }
    if (approval.parameterFingerprint !== input.parameterFingerprint) {
      return Promise.resolve({ status: "fingerprint_mismatch", approval });
    }
    if (input.now >= approval.expiresAt) {
      return Promise.resolve({ status: "expired", approval });
    }
    this.#appliedActionIds.add(input.actionId);
    return Promise.resolve({ status: "claimed", approval });
  }
}
