import type {
  AppliedActionRecord,
  BoundaryRequest,
  KernelError,
  ProposedAction,
  TurnRecord,
} from "./types.ts";

export interface SafetyActionGateContext {
  now: () => number;
  createId: () => string;
}

export interface ApplyActionInput {
  action: ProposedAction;
  currentHash?: string;
  apply: (action: ProposedAction) => Promise<unknown>;
}

export interface ApplyActionResult {
  action: ProposedAction;
  applied: boolean;
  result?: unknown;
  error?: KernelError;
  record: AppliedActionRecord;
}

export class SafetyActionGate {
  readonly #context: SafetyActionGateContext;

  constructor(context: SafetyActionGateContext) {
    this.#context = context;
  }

  prepareAction(action: ProposedAction): ProposedAction {
    return {
      ...action,
      state: action.state === "draft" ? "ready" : action.state,
    };
  }

  createBoundaryRequest(reason: string, action: ProposedAction): BoundaryRequest {
    return {
      id: this.#context.createId(),
      reason,
      action: this.prepareAction(action),
      state: "pending",
      createdAt: this.#context.now(),
    };
  }

  approveBoundaryRequest(request: BoundaryRequest): BoundaryRequest {
    return {
      ...request,
      state: "approved",
      resolvedAt: this.#context.now(),
      action: { ...request.action, state: "approved" },
    };
  }

  rejectBoundaryRequest(request: BoundaryRequest): BoundaryRequest {
    return {
      ...request,
      state: "rejected",
      resolvedAt: this.#context.now(),
      action: { ...request.action, state: "rejected" },
    };
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
        action: input.action,
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
