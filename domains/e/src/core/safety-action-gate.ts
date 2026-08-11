import type {
  AppliedActionRecord,
  ApprovalResolutionRecord,
  BoundaryRequest,
  KernelError,
  ProposedAction,
  TurnRecord,
} from "./types.ts";
import { APPROVAL_ERROR_CODES, APPROVAL_TTL_MS } from "./approval-constants.ts";
import {
  type ApprovalConsumptionStore,
  InMemoryApprovalConsumptionStore,
} from "./approval-consumption-store.ts";

export { APPROVAL_TTL_MS } from "./approval-constants.ts";

export interface SafetyActionGateContext {
  now: () => number;
  createId: () => string;
  approvalTtlMs?: number;
  fingerprintAction?: (action: ProposedAction) => string;
  consumptionStore?: ApprovalConsumptionStore;
  allowLegacyUnregisteredApprovals?: boolean;
}

export interface ApplyActionInput {
  action: ProposedAction;
  currentHash?: string;
  parameterFingerprint?: string;
  apply: (action: ProposedAction) => Promise<unknown>;
}

export interface ApplyActionResult {
  action: ProposedAction;
  applied: boolean;
  result?: unknown;
  error?: KernelError;
  record: AppliedActionRecord;
}

export interface SecuredBoundaryRequest extends BoundaryRequest {
  parameterFingerprint: string;
  expiresAt: number;
}

export class ApprovalGateError extends Error {
  readonly error: KernelError;
  readonly record: ApprovalResolutionRecord;

  constructor(error: KernelError, record: ApprovalResolutionRecord) {
    super(`${error.code}: ${error.message}`);
    this.name = "ApprovalGateError";
    this.error = error;
    this.record = record;
  }
}

export class SafetyActionGate {
  readonly #context: SafetyActionGateContext;
  readonly #fingerprintAction: (action: ProposedAction) => string;
  readonly #consumptionStore: ApprovalConsumptionStore;
  readonly #allowLegacyUnregisteredApprovals: boolean;

  constructor(context: SafetyActionGateContext) {
    this.#context = context;
    this.#fingerprintAction = context.fingerprintAction ?? fingerprintAction;
    this.#consumptionStore = context.consumptionStore ??
      new InMemoryApprovalConsumptionStore();
    this.#allowLegacyUnregisteredApprovals =
      context.allowLegacyUnregisteredApprovals === true;
  }

  prepareAction(action: ProposedAction): ProposedAction {
    const parameterFingerprint = this.#fingerprintAction(action);
    return {
      ...action,
      parameterFingerprint,
      state: action.state === "draft" ? "ready" : action.state,
    };
  }

  async createBoundaryRequest(
    reason: string,
    action: ProposedAction,
  ): Promise<SecuredBoundaryRequest> {
    const createdAt = this.#context.now();
    const preparedAction = this.prepareAction(action);
    const request: SecuredBoundaryRequest = {
      id: this.#context.createId(),
      reason,
      action: preparedAction,
      parameterFingerprint: preparedAction.parameterFingerprint!,
      state: "pending",
      createdAt,
      expiresAt: createdAt + (this.#context.approvalTtlMs ?? APPROVAL_TTL_MS),
    };
    await this.#consumptionStore.registerIfAbsent({
      requestId: request.id,
      actionId: preparedAction.id,
      parameterFingerprint: request.parameterFingerprint,
      expiresAt: request.expiresAt,
    });
    return request;
  }

  async approveBoundaryRequest(request: BoundaryRequest): Promise<BoundaryRequest> {
    return await this.#resolveBoundaryRequest(request, "approved");
  }

  async rejectBoundaryRequest(request: BoundaryRequest): Promise<BoundaryRequest> {
    return await this.#resolveBoundaryRequest(request, "rejected");
  }

  async resolveBoundaryRequest(
    request: BoundaryRequest,
    resolution: "approved" | "rejected",
  ): Promise<BoundaryRequest> {
    return await this.#resolveBoundaryRequest(request, resolution);
  }

  async applyAction(input: ApplyActionInput): Promise<ApplyActionResult> {
    const currentFingerprint = this.#fingerprintAction(input.action);
    if (
      (input.parameterFingerprint !== undefined &&
        input.parameterFingerprint !== currentFingerprint)
    ) {
      const error = {
        code: APPROVAL_ERROR_CODES.fingerprintMismatch,
        message: "Approved parameters do not match the action being applied.",
      };
      return {
        action: { ...input.action, state: "stale" },
        applied: false,
        error,
        record: this.#appliedActionRecord(input.action.id, "stale", undefined, error),
      };
    }

    if (
      input.action.beforeHash !== undefined &&
      input.currentHash !== undefined &&
      input.action.beforeHash !== input.currentHash
    ) {
      const error = {
        code: "action_stale",
        message: "Action beforeHash does not match the current target hash.",
      };
      return {
        action: { ...input.action, state: "stale" },
        applied: false,
        error,
        record: this.#appliedActionRecord(input.action.id, "stale", undefined, error),
      };
    }

    const applicationClaim = await this.#consumptionStore.claimApplication({
      actionId: input.action.id,
      parameterFingerprint: currentFingerprint,
      now: this.#context.now(),
    });
    if (applicationClaim.status === "already_claimed") {
      const error = {
        code: APPROVAL_ERROR_CODES.alreadyApplied,
        message: "Approval has already been consumed by an application attempt.",
      };
      return {
        action: input.action,
        applied: false,
        error,
        record: this.#appliedActionRecord(
          input.action.id,
          "replayed",
          undefined,
          error,
        ),
      };
    }
    if (applicationClaim.status === "fingerprint_mismatch") {
      const error = {
        code: APPROVAL_ERROR_CODES.fingerprintMismatch,
        message: "Approved parameters do not match the action being applied.",
      };
      return {
        action: { ...input.action, state: "stale" },
        applied: false,
        error,
        record: this.#appliedActionRecord(input.action.id, "stale", undefined, error),
      };
    }
    if (applicationClaim.status === "expired") {
      const error = {
        code: APPROVAL_ERROR_CODES.expired,
        message: "Approval expired before the action could be applied.",
      };
      return {
        action: { ...input.action, state: "expired" },
        applied: false,
        error,
        record: this.#appliedActionRecord(input.action.id, "expired", undefined, error),
      };
    }
    if (applicationClaim.status === "not_approved") {
      const error = {
        code: APPROVAL_ERROR_CODES.notApproved,
        message: "Approval does not have an approved resolution.",
      };
      return {
        action: input.action,
        applied: false,
        error,
        record: this.#appliedActionRecord(
          input.action.id,
          "rejected",
          undefined,
          error,
        ),
      };
    }
    if (applicationClaim.status === "unknown_approval") {
      const error = {
        code: APPROVAL_ERROR_CODES.notRegistered,
        message: "Approval is not registered with the consumption store.",
      };
      return {
        action: input.action,
        applied: false,
        error,
        record: this.#appliedActionRecord(
          input.action.id,
          "rejected",
          undefined,
          error,
        ),
      };
    }

    try {
      const result = await input.apply(input.action);
      return {
        action: { ...input.action, state: "applied" },
        applied: true,
        result,
        record: this.#appliedActionRecord(input.action.id, "applied", result),
      };
    } catch (error) {
      const kernelError = {
        code: "action_failed",
        message: error instanceof Error ? error.message : String(error),
      };
      return {
        action: { ...input.action, state: "failed" },
        applied: false,
        error: kernelError,
        record: this.#appliedActionRecord(
          input.action.id,
          "failed",
          undefined,
          kernelError,
        ),
      };
    }
  }

  async #resolveBoundaryRequest(
    request: BoundaryRequest,
    resolution: "approved" | "rejected",
  ): Promise<BoundaryRequest> {
    const now = this.#context.now();
    const expiresAt = request.expiresAt ??
      request.createdAt + (this.#context.approvalTtlMs ?? APPROVAL_TTL_MS);
    const preparedAction = this.prepareAction(request.action);
    if (this.#allowLegacyUnregisteredApprovals) {
      await this.#consumptionStore.registerIfAbsent({
        requestId: request.id,
        actionId: preparedAction.id,
        parameterFingerprint: preparedAction.parameterFingerprint!,
        expiresAt,
      });
    }
    const resolutionClaim = await this.#consumptionStore.claimResolution({
      requestId: request.id,
      resolution,
      parameterFingerprint: preparedAction.parameterFingerprint!,
      now,
    });
    if (resolutionClaim.status === "already_claimed") {
      const error = {
        code: APPROVAL_ERROR_CODES.alreadyResolved,
        message: "Approval request has already been resolved.",
      };
      throw new ApprovalGateError(
        error,
        this.#resolutionRecord(request, "replayed", now, error),
      );
    }
    if (resolutionClaim.status === "unknown_approval") {
      const error = {
        code: APPROVAL_ERROR_CODES.notRegistered,
        message: "Approval is not registered with the consumption store.",
      };
      throw new ApprovalGateError(
        error,
        this.#resolutionRecord(request, "stale", now, error),
      );
    }
    if (resolutionClaim.status === "expired") {
      const error = {
        code: APPROVAL_ERROR_CODES.expired,
        message: "Approval request expired before resolution.",
      };
      throw new ApprovalGateError(
        error,
        this.#resolutionRecord(request, "expired", now, error),
      );
    }
    if (resolutionClaim.status === "fingerprint_mismatch") {
      const error = {
        code: APPROVAL_ERROR_CODES.fingerprintMismatch,
        message: "Approved parameters changed before resolution.",
      };
      throw new ApprovalGateError(
        error,
        this.#resolutionRecord(request, "stale", now, error),
      );
    }
    return {
      ...request,
      parameterFingerprint: resolutionClaim.approval.parameterFingerprint,
      expiresAt: resolutionClaim.approval.expiresAt,
      state: resolution,
      resolvedAt: now,
      action: {
        ...preparedAction,
        parameterFingerprint: resolutionClaim.approval.parameterFingerprint,
        state: resolution,
        approvalExpiresAt: resolutionClaim.approval.expiresAt,
      },
    };
  }

  #resolutionRecord(
    request: BoundaryRequest,
    state: ApprovalResolutionRecord["state"],
    at: number,
    error?: KernelError,
  ): ApprovalResolutionRecord {
    return {
      id: this.#context.createId(),
      requestId: request.id,
      actionId: request.action.id,
      state,
      error,
      at,
    };
  }

  recordBoundaryResolution(record: TurnRecord, request: BoundaryRequest): TurnRecord {
    return {
      ...record,
      boundaryRequests: record.boundaryRequests.map((candidate) =>
        candidate.id === request.id ? request : candidate
      ),
      proposedActions: record.proposedActions.map((candidate) =>
        candidate.id === request.action.id ? request.action : candidate
      ),
    };
  }

  recordAppliedAction(record: TurnRecord, result: ApplyActionResult): TurnRecord {
    return {
      ...record,
      proposedActions: record.proposedActions.map((candidate) =>
        candidate.id === result.action.id ? result.action : candidate
      ),
      appliedActions: [...record.appliedActions, result.record],
    };
  }

  #appliedActionRecord(
    actionId: string,
    state: AppliedActionRecord["state"],
    result?: unknown,
    error?: KernelError,
  ): AppliedActionRecord {
    return {
      id: this.#context.createId(),
      actionId,
      state,
      result,
      error,
      at: this.#context.now(),
    };
  }
}

function fingerprintAction(action: ProposedAction): string {
  return `approval-v1:${
    JSON.stringify([
      action.kind,
      action.target,
      action.preview ?? null,
      action.beforeHash ?? null,
    ])
  }`;
}
