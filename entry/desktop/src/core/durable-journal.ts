import type {
  ApprovalApplicationClaim,
  ApprovalConsumptionStore,
  ApprovalRegistration,
  ApprovalResolutionClaim,
} from "../../../../domains/e/src/core/approval-consumption-store.ts";
import type { ApplyActionResult } from "../../../../domains/e/src/core/safety-action-gate.ts";
import type { BoundaryRequest } from "../../../../domains/e/src/core/types.ts";
import type { AuditEvent } from "../../../../domains/_shared/openfx-node/types.ts";

interface StoredApproval extends ApprovalRegistration {
  applied: boolean;
}

export type JournalEvent =
  | {
    type: "approval.registered";
    approval: StoredApproval;
    request?: BoundaryRequest;
    audit?: AuditEvent;
  }
  | {
    type: "approval.resolved";
    requestId: string;
    resolution: "approved" | "rejected";
    at: number;
    audit: AuditEvent;
  }
  | {
    type: "execution.intent";
    requestId: string;
    actionId: string;
    at: number;
  }
  | {
    type: "execution.outcome";
    request: BoundaryRequest;
    state: "applied" | "failed";
    at: number;
    audit: AuditEvent;
  }
  | {
    type: "execution.ambiguous";
    requestId: string;
    actionId: string;
    at: number;
    audit: AuditEvent;
  }
  | { type: "audit.appended"; audit: AuditEvent }
  /** @deprecated Read only for migration into the bounded replay nonce table. */
  | { type: "replay.claimed"; nonce: string; expiresAt: number };

export interface JournalStorage {
  transact<Result>(
    operation: (
      events: readonly JournalEvent[],
    ) => { result: Result; append?: JournalEvent[] },
  ): Promise<Result>;
  claimReplayNonce(nonce: string, expiresAt: number, now: number): Promise<boolean>;
}

export interface DesktopJournalOptions {
  now?: () => number;
  createId?: () => string;
}

export interface JournalOperationContext {
  deadlineAt?: number;
  signal?: AbortSignal;
}

export interface DesktopJournal extends ApprovalConsumptionStore {
  registerRequest(
    request: BoundaryRequest,
    nodeId: string,
    context?: JournalOperationContext,
  ): Promise<void>;
  get(id: string): Promise<BoundaryRequest | null>;
  list(): Promise<BoundaryRequest[]>;
  recordApplicationOutcome(
    request: BoundaryRequest,
    application: ApplyActionResult,
    nodeId: string,
  ): Promise<void>;
  recoverIncompleteExecutions(): Promise<number>;
  appendAudit(
    event:
      & Omit<AuditEvent, "id" | "createdAt">
      & Partial<Pick<AuditEvent, "id" | "createdAt">>,
  ): Promise<AuditEvent>;
  listAudit(limit?: number): Promise<AuditEvent[]>;
  claimReplayNonce(nonce: string, expiresAt: number, now: number): Promise<boolean>;
}

interface JournalState {
  approvalsByRequest: Map<string, StoredApproval>;
  approvalsByAction: Map<string, StoredApproval>;
  requests: Map<string, BoundaryRequest>;
  executions: Map<
    string,
    { requestId: string; state: "intent" | "applied" | "failed" | "ambiguous" }
  >;
  audit: AuditEvent[];
}

export const createDesktopJournal = (
  storage: JournalStorage,
  options: DesktopJournalOptions = {},
): DesktopJournal => {
  const now = options.now ?? Date.now;
  let sequence = 0;
  const createId = options.createId ?? (() => `journal-${now()}-${++sequence}`);
  const auditEvent = (
    input: Omit<AuditEvent, "id" | "createdAt">,
    at = now(),
  ): AuditEvent => ({ ...input, id: createId(), createdAt: at });

  return {
    registerIfAbsent(input) {
      return storage.transact((events) => {
        const state = reduceJournal(events);
        const existing = state.approvalsByRequest.get(input.requestId) ??
          state.approvalsByAction.get(input.actionId);
        if (existing) return { result: publicApproval(existing) };
        const approval: StoredApproval = {
          ...input,
          resolution: "pending",
          applied: false,
        };
        return {
          result: publicApproval(approval),
          append: [{ type: "approval.registered", approval }],
        };
      });
    },

    claimResolution(input) {
      return storage.transact<ApprovalResolutionClaim>((events) => {
        const state = reduceJournal(events);
        const approval = state.approvalsByRequest.get(input.requestId);
        if (!approval) return { result: { status: "unknown_approval" } };
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
        const request = state.requests.get(input.requestId);
        const action = request?.action.target ?? "approval";
        const resolved = { ...approval, resolution: input.resolution };
        return {
          result: { status: "claimed", approval: publicApproval(resolved) },
          append: [{
            type: "approval.resolved",
            requestId: input.requestId,
            resolution: input.resolution,
            at: input.now,
            audit: auditEvent({
              nodeId: request ? auditNodeId(state.audit, request.id) : undefined,
              category: "approval",
              action: `${action}.${input.resolution}`,
              outcome: input.resolution === "approved" ? "succeeded" : "rejected",
              subjectId: input.requestId,
            }, input.now),
          }],
        };
      });
    },

    claimApplication(input) {
      return storage.transact<ApprovalApplicationClaim>((events) => {
        const state = reduceJournal(events);
        const approval = state.approvalsByAction.get(input.actionId);
        if (!approval) return { result: { status: "unknown_approval" } };
        if (approval.resolution !== "approved") {
          return {
            result: { status: "not_approved", approval: publicApproval(approval) },
          };
        }
        if (approval.applied || state.executions.has(input.actionId)) {
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
        const claimed = { ...approval, applied: true };
        return {
          result: { status: "claimed", approval: publicApproval(claimed) },
          append: [{
            type: "execution.intent",
            requestId: approval.requestId,
            actionId: approval.actionId,
            at: input.now,
          }],
        };
      });
    },

    registerRequest(request, nodeId, context) {
      return storage.transact((events) => {
        assertJournalOperationActive(context);
        const state = reduceJournal(events);
        const existing = state.approvalsByRequest.get(request.id) ??
          state.approvalsByAction.get(request.action.id);
        if (existing) return { result: undefined };
        const approval: StoredApproval = {
          requestId: request.id,
          actionId: request.action.id,
          parameterFingerprint: request.parameterFingerprint!,
          expiresAt: request.expiresAt!,
          resolution: "pending",
          applied: false,
        };
        return {
          result: undefined,
          append: [{
            type: "approval.registered",
            approval,
            request: clone(request),
            audit: auditEvent({
              nodeId,
              category: "approval",
              action: `${request.action.target}.requested`,
              outcome: "succeeded",
              subjectId: request.id,
              metadata: {
                parameterFingerprint: request.parameterFingerprint,
              },
            }, request.createdAt),
          }],
        };
      });
    },

    async get(id) {
      return await storage.transact((events) => {
        const request = reduceJournal(events).requests.get(id);
        return { result: request ? clone(request) : null };
      });
    },

    async list() {
      return await storage.transact((events) => ({
        result: [...reduceJournal(events).requests.values()]
          .sort((left, right) => left.createdAt - right.createdAt)
          .map(clone),
      }));
    },

    recordApplicationOutcome(request, application, nodeId) {
      return storage.transact((events) => {
        const state = reduceJournal(events);
        const execution = state.executions.get(request.action.id);
        if (!execution || execution.state !== "intent") {
          return { result: undefined };
        }
        const at = now();
        const outcome = application.applied ? "applied" : "failed";
        return {
          result: undefined,
          append: [{
            type: "execution.outcome",
            request: clone(request),
            state: outcome,
            at,
            audit: auditEvent({
              nodeId,
              category: "approval",
              action: `${request.action.target}.${outcome}`,
              outcome: application.applied ? "succeeded" : "failed",
              subjectId: request.id,
              metadata: application.error
                ? { error: application.error.code }
                : undefined,
            }, at),
          }],
        };
      });
    },

    recoverIncompleteExecutions() {
      return storage.transact((events) => {
        const state = reduceJournal(events);
        const append: JournalEvent[] = [];
        for (const [actionId, execution] of state.executions) {
          if (execution.state !== "intent") continue;
          const request = state.requests.get(execution.requestId);
          const at = now();
          append.push({
            type: "execution.ambiguous",
            requestId: execution.requestId,
            actionId,
            at,
            audit: auditEvent({
              nodeId: request ? auditNodeId(state.audit, request.id) : undefined,
              category: "approval",
              action: `${request?.action.target ?? actionId}.ambiguous`,
              outcome: "failed",
              subjectId: execution.requestId,
              metadata: { executionState: "ambiguous" },
            }, at),
          });
        }
        return { result: append.length, append };
      });
    },

    appendAudit(input) {
      const event: AuditEvent = {
        ...input,
        id: input.id ?? createId(),
        createdAt: input.createdAt ?? now(),
      };
      return storage.transact(() => ({
        result: clone(event),
        append: [{ type: "audit.appended", audit: event }],
      }));
    },

    listAudit(limit = 1_000) {
      return storage.transact((events) => ({
        result: reduceJournal(events).audit.slice(-Math.max(0, limit)).map(clone),
      }));
    },

    claimReplayNonce(nonce, expiresAt, claimedAt) {
      return storage.claimReplayNonce(nonce, expiresAt, claimedAt);
    },
  };
};

export const createMemoryJournalStorage = (): JournalStorage => {
  const events: JournalEvent[] = [];
  const replayNonces = new Map<string, number>();
  let queue = Promise.resolve();
  return {
    transact<Result>(
      operation: (
        events: readonly JournalEvent[],
      ) => { result: Result; append?: JournalEvent[] },
    ): Promise<Result> {
      let resolveResult!: (result: Result) => void;
      let rejectResult!: (error: unknown) => void;
      const result = new Promise<Result>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });
      queue = queue.then(() => {
        const mutation = operation(events.map(clone));
        if (mutation.append) events.push(...mutation.append.map(clone));
        resolveResult(clone(mutation.result));
      }, rejectResult).catch(rejectResult);
      return result;
    },
    claimReplayNonce(nonce, expiresAt, now) {
      for (const [retainedNonce, retainedUntil] of replayNonces) {
        if (retainedUntil <= now) replayNonces.delete(retainedNonce);
      }
      if (replayNonces.has(nonce)) return Promise.resolve(false);
      replayNonces.set(nonce, expiresAt);
      return Promise.resolve(true);
    },
  };
};

const assertJournalOperationActive = (
  context: JournalOperationContext | undefined,
): void => {
  if (context?.signal?.aborted) throw new Error("agent_turn_aborted");
  if (context?.deadlineAt !== undefined && Date.now() >= context.deadlineAt) {
    throw new Error("agent_turn_deadline");
  }
};

const reduceJournal = (events: readonly JournalEvent[]): JournalState => {
  const state: JournalState = {
    approvalsByRequest: new Map(),
    approvalsByAction: new Map(),
    requests: new Map(),
    executions: new Map(),
    audit: [],
  };
  for (const event of events) {
    switch (event.type) {
      case "approval.registered":
        setApproval(state, event.approval);
        if (event.request) state.requests.set(event.request.id, clone(event.request));
        if (event.audit) state.audit.push(clone(event.audit));
        break;
      case "approval.resolved": {
        const approval = state.approvalsByRequest.get(event.requestId);
        if (approval) setApproval(state, { ...approval, resolution: event.resolution });
        const request = state.requests.get(event.requestId);
        if (request) {
          state.requests.set(event.requestId, {
            ...request,
            state: event.resolution,
            resolvedAt: event.at,
            action: { ...request.action, state: event.resolution },
          });
        }
        state.audit.push(clone(event.audit));
        break;
      }
      case "execution.intent": {
        const approval = state.approvalsByAction.get(event.actionId);
        if (approval) setApproval(state, { ...approval, applied: true });
        state.executions.set(event.actionId, {
          requestId: event.requestId,
          state: "intent",
        });
        break;
      }
      case "execution.outcome":
        state.executions.set(event.request.action.id, {
          requestId: event.request.id,
          state: event.state,
        });
        state.requests.set(event.request.id, clone(event.request));
        state.audit.push(clone(event.audit));
        break;
      case "execution.ambiguous": {
        state.executions.set(event.actionId, {
          requestId: event.requestId,
          state: "ambiguous",
        });
        const request = state.requests.get(event.requestId);
        if (request) {
          state.requests.set(event.requestId, {
            ...request,
            action: { ...request.action, state: "failed" },
          });
        }
        state.audit.push(clone(event.audit));
        break;
      }
      case "audit.appended":
        state.audit.push(clone(event.audit));
        break;
      case "replay.claimed":
        // Legacy replay claims are migrated by persistent storage. They are not
        // part of the append-only approval/audit projection anymore.
        break;
    }
  }
  return state;
};

const setApproval = (state: JournalState, approval: StoredApproval): void => {
  state.approvalsByRequest.set(approval.requestId, approval);
  state.approvalsByAction.set(approval.actionId, approval);
};

const publicApproval = (approval: StoredApproval): ApprovalRegistration => ({
  requestId: approval.requestId,
  actionId: approval.actionId,
  parameterFingerprint: approval.parameterFingerprint,
  expiresAt: approval.expiresAt,
  resolution: approval.resolution,
});

const auditNodeId = (events: AuditEvent[], requestId: string): string | undefined =>
  events.find((event) => event.subjectId === requestId)?.nodeId;

const clone = <Value>(value: Value): Value => structuredClone(value);
