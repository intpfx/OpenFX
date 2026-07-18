import type {
  ApprovalApplicationClaim,
  ApprovalConsumptionStore,
  ApprovalRegistration,
  ApprovalRegistrationInput,
  ApprovalResolutionClaim,
} from "../../../../domains/e/src/core/approval-consumption-store.ts";

export interface ApprovalPersistence {
  read(): Promise<string | null>;
  compareAndSet(expected: string | null, next: string): Promise<boolean>;
}

interface StoredApproval extends ApprovalRegistration {
  applied: boolean;
}

interface StoredApprovalState {
  version: 1;
  approvals: StoredApproval[];
}

const EMPTY_STATE: StoredApprovalState = { version: 1, approvals: [] };

export class PersistentApprovalConsumptionStore implements ApprovalConsumptionStore {
  readonly #persistence: ApprovalPersistence;

  constructor(persistence: ApprovalPersistence) {
    this.#persistence = persistence;
  }

  async registerIfAbsent(
    input: ApprovalRegistrationInput,
  ): Promise<ApprovalRegistration> {
    return await this.#mutate<ApprovalRegistration>((state) => {
      const existing = state.approvals.find((approval) =>
        approval.requestId === input.requestId ||
        approval.actionId === input.actionId
      );
      if (existing) return { result: publicApproval(existing) };
      const approval: StoredApproval = {
        ...input,
        resolution: "pending",
        applied: false,
      };
      return {
        result: publicApproval(approval),
        next: { ...state, approvals: [...state.approvals, approval] },
      };
    });
  }

  async claimResolution(input: {
    requestId: string;
    resolution: "approved" | "rejected";
    parameterFingerprint: string;
    now: number;
  }): Promise<ApprovalResolutionClaim> {
    return await this.#mutate<ApprovalResolutionClaim>((state) => {
      const index = state.approvals.findIndex((approval) =>
        approval.requestId === input.requestId
      );
      if (index < 0) return { result: { status: "unknown_approval" } };
      const approval = state.approvals[index]!;
      if (approval.resolution !== "pending") {
        return {
          result: {
            status: "already_claimed",
            approval: publicApproval(approval),
          },
        };
      }
      if (approval.parameterFingerprint !== input.parameterFingerprint) {
        return {
          result: {
            status: "fingerprint_mismatch",
            approval: publicApproval(approval),
          },
        };
      }
      if (input.now >= approval.expiresAt) {
        return {
          result: { status: "expired", approval: publicApproval(approval) },
        };
      }
      const resolved = { ...approval, resolution: input.resolution };
      return {
        result: { status: "claimed", approval: publicApproval(resolved) },
        next: replaceApproval(state, index, resolved),
      };
    });
  }

  async claimApplication(input: {
    actionId: string;
    parameterFingerprint: string;
    now: number;
  }): Promise<ApprovalApplicationClaim> {
    return await this.#mutate<ApprovalApplicationClaim>((state) => {
      const index = state.approvals.findIndex((approval) =>
        approval.actionId === input.actionId
      );
      if (index < 0) return { result: { status: "unknown_approval" } };
      const approval = state.approvals[index]!;
      if (approval.resolution !== "approved") {
        return {
          result: {
            status: "not_approved",
            approval: publicApproval(approval),
          },
        };
      }
      if (approval.applied) {
        return {
          result: {
            status: "already_claimed",
            approval: publicApproval(approval),
          },
        };
      }
      if (approval.parameterFingerprint !== input.parameterFingerprint) {
        return {
          result: {
            status: "fingerprint_mismatch",
            approval: publicApproval(approval),
          },
        };
      }
      if (input.now >= approval.expiresAt) {
        return {
          result: { status: "expired", approval: publicApproval(approval) },
        };
      }
      const applied = { ...approval, applied: true };
      return {
        result: { status: "claimed", approval: publicApproval(applied) },
        next: replaceApproval(state, index, applied),
      };
    });
  }

  async #mutate<Result>(
    operation: (
      state: StoredApprovalState,
    ) => { result: Result; next?: StoredApprovalState },
  ): Promise<Result> {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const raw = await this.#persistence.read();
      const state = parseState(raw);
      const mutation = operation(state);
      if (!mutation.next) return mutation.result;
      if (
        await this.#persistence.compareAndSet(
          raw,
          JSON.stringify(mutation.next),
        )
      ) return mutation.result;
    }
    throw new Error("approval_store_conflict");
  }
}

const replaceApproval = (
  state: StoredApprovalState,
  index: number,
  approval: StoredApproval,
): StoredApprovalState => ({
  ...state,
  approvals: state.approvals.map((current, currentIndex) =>
    currentIndex === index ? approval : current
  ),
});

const publicApproval = (approval: StoredApproval): ApprovalRegistration => ({
  requestId: approval.requestId,
  actionId: approval.actionId,
  parameterFingerprint: approval.parameterFingerprint,
  expiresAt: approval.expiresAt,
  resolution: approval.resolution,
});

const parseState = (raw: string | null): StoredApprovalState => {
  if (raw === null || raw === "") return EMPTY_STATE;
  const parsed = JSON.parse(raw) as StoredApprovalState;
  if (parsed.version !== 1 || !Array.isArray(parsed.approvals)) {
    throw new Error("approval_store_invalid");
  }
  return parsed;
};
