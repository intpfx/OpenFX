import type {
  AppliedActionRecord,
  ApprovalResolutionRecord,
  BoundaryRequest,
  KernelError,
  ProposedAction,
  TurnRecord,
} from "./types.ts";
import {
  APPROVAL_TTL_MS,
  OPENFX_NODE_ERROR_CODES,
} from "../../../_shared/openfx-node/constants.ts";

export { APPROVAL_TTL_MS } from "../../../_shared/openfx-node/constants.ts";

export interface SafetyActionGateContext {
  now: () => number;
  createId: () => string;
  approvalTtlMs?: number;
  fingerprintAction?: (action: ProposedAction) => string;
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
  readonly #resolvedRequestIds = new Set<string>();
  readonly #appliedActionIds = new Set<string>();

  constructor(context: SafetyActionGateContext) {
    this.#context = context;
  }

  prepareAction(action: ProposedAction): ProposedAction {
    const parameterFingerprint = action.parameterFingerprint ??
      (this.#context.fingerprintAction ?? fingerprintAction)(action);
    return {
      ...action,
      parameterFingerprint,
      state: action.state === "draft" ? "ready" : action.state,
    };
  }

  createBoundaryRequest(
    reason: string,
    action: ProposedAction,
  ): SecuredBoundaryRequest {
    const createdAt = this.#context.now();
    const preparedAction = this.prepareAction(action);
    return {
      id: this.#context.createId(),
      reason,
      action: preparedAction,
      parameterFingerprint: preparedAction.parameterFingerprint!,
      state: "pending",
      createdAt,
      expiresAt: createdAt + (this.#context.approvalTtlMs ?? APPROVAL_TTL_MS),
    };
  }

  approveBoundaryRequest(request: BoundaryRequest): BoundaryRequest {
    return this.#resolveBoundaryRequest(request, "approved");
  }

  rejectBoundaryRequest(request: BoundaryRequest): BoundaryRequest {
    return this.#resolveBoundaryRequest(request, "rejected");
  }

  resolveBoundaryRequest(
    request: BoundaryRequest,
    resolution: "approved" | "rejected",
  ): BoundaryRequest {
    return resolution === "approved"
      ? this.approveBoundaryRequest(request)
      : this.rejectBoundaryRequest(request);
  }

  async applyAction(input: ApplyActionInput): Promise<ApplyActionResult> {
    if (
      input.action.state === "applied" || input.action.state === "failed" ||
      this.#appliedActionIds.has(input.action.id)
    ) {
      const error = {
        code: OPENFX_NODE_ERROR_CODES.approvalAlreadyApplied,
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

    if (input.action.state !== "approved") {
      const error = {
        code: "action_not_approved",
        message: "Only approved actions can be applied.",
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

    if (
      input.action.approvalExpiresAt !== undefined &&
      this.#context.now() >= input.action.approvalExpiresAt
    ) {
      const error = {
        code: OPENFX_NODE_ERROR_CODES.approvalExpired,
        message: "Approval expired before the action could be applied.",
      };
      return {
        action: { ...input.action, state: "expired" },
        applied: false,
        error,
        record: this.#appliedActionRecord(input.action.id, "expired", undefined, error),
      };
    }

    if (
      input.parameterFingerprint !== undefined &&
      input.action.parameterFingerprint !== input.parameterFingerprint
    ) {
      const error = {
        code: OPENFX_NODE_ERROR_CODES.approvalFingerprintMismatch,
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

    this.#appliedActionIds.add(input.action.id);
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

  #resolveBoundaryRequest(
    request: BoundaryRequest,
    resolution: "approved" | "rejected",
  ): BoundaryRequest {
    const now = this.#context.now();
    const expiresAt = request.expiresAt ??
      request.createdAt + (this.#context.approvalTtlMs ?? APPROVAL_TTL_MS);
    if (request.state !== "pending" || this.#resolvedRequestIds.has(request.id)) {
      const error = {
        code: OPENFX_NODE_ERROR_CODES.approvalAlreadyResolved,
        message: "Approval request has already been resolved.",
      };
      throw new ApprovalGateError(
        error,
        this.#resolutionRecord(request, "replayed", now, error),
      );
    }
    if (now >= expiresAt) {
      this.#resolvedRequestIds.add(request.id);
      const error = {
        code: OPENFX_NODE_ERROR_CODES.approvalExpired,
        message: "Approval request expired before resolution.",
      };
      throw new ApprovalGateError(
        error,
        this.#resolutionRecord(request, "expired", now, error),
      );
    }

    this.#resolvedRequestIds.add(request.id);
    const action = this.prepareAction(request.action);
    return {
      ...request,
      parameterFingerprint: request.parameterFingerprint ?? action.parameterFingerprint,
      expiresAt,
      state: resolution,
      resolvedAt: now,
      action: {
        ...action,
        state: resolution,
        approvalExpiresAt: expiresAt,
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
