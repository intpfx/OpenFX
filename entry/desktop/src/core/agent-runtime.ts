import {
  APPROVAL_TTL_MS,
  ApprovalGateError,
  SafetyActionGate,
} from "../../../../domains/e/src/core/safety-action-gate.ts";
import type { ApplyActionResult } from "../../../../domains/e/src/core/safety-action-gate.ts";
import type {
  BoundaryRequest,
  ProposedAction,
} from "../../../../domains/e/src/core/types.ts";
import type { ApprovalConsumptionStore } from "../../../../domains/e/src/core/approval-consumption-store.ts";
import { OPENFX_NODE_ERROR_CODES } from "../../../../domains/_shared/openfx-node/constants.ts";
import type { AuditLog } from "./audit-log.ts";
import {
  createDesktopJournal,
  createMemoryJournalStorage,
  type DesktopJournal,
} from "./durable-journal.ts";
import { findAgentTool } from "./agent-tools.ts";
import { isAllowedApplication } from "./effect-policy.ts";

export interface ApprovalRequestRepository extends ApprovalConsumptionStore {
  get(id: string): Promise<BoundaryRequest | null>;
  list(): Promise<BoundaryRequest[]>;
  registerRequest(request: BoundaryRequest, nodeId: string): Promise<void>;
  recordApplicationOutcome(
    request: BoundaryRequest,
    application: ApplyActionResult,
    nodeId: string,
  ): Promise<void>;
}

export interface AgentRuntimeEvents {
  approvalRequested(request: BoundaryRequest): Promise<void>;
  approvalResolved(
    request: BoundaryRequest,
    decision: "approved" | "rejected",
  ): Promise<void>;
}

export interface AgentReadTools {
  overview(): Promise<unknown>;
  processes(): Promise<unknown>;
  network(): Promise<unknown>;
  relay(): Promise<unknown>;
}

export interface AgentEffectTools {
  inspectProcess(pid: number): Promise<ProcessIdentity | null>;
  kill(pid: number, expected: ProcessIdentity): Promise<unknown>;
  openApplication(application: string): Promise<unknown>;
  updateRelay(enabled: boolean): Promise<unknown>;
}

export interface ProcessIdentity {
  pid: number;
  command: string;
  startedAt: string;
}

export interface AgentToolRuntimeDependencies {
  gate: SafetyActionGate;
  approvals: ApprovalRequestRepository;
  audit: AuditLog;
  nodeId(): string;
  ownPid(): number;
  now(): number;
  createId(): string;
  read: AgentReadTools;
  effects: AgentEffectTools;
  events?: AgentRuntimeEvents;
}

export interface AgentInvocationResult {
  ok: boolean;
  approvalRequired: boolean;
  result?: unknown;
  approval?: BoundaryRequest;
  error?: string;
}

export interface AgentToolRuntime {
  invoke(
    toolId: string,
    input: Record<string, unknown>,
  ): Promise<AgentInvocationResult>;
  resolve(input: {
    id: string;
    decision: "approved" | "rejected";
    parameterFingerprint: string;
  }): Promise<{
    ok: boolean;
    applied: boolean;
    request?: BoundaryRequest;
    result?: unknown;
    error?: string;
  }>;
  listApprovals(): Promise<BoundaryRequest[]>;
}

export const createAgentToolRuntime = (
  dependencies: AgentToolRuntimeDependencies,
): AgentToolRuntime => ({
  async invoke(toolId, input) {
    const tool = findAgentTool(toolId);
    if (!tool) {
      return {
        ok: false,
        approvalRequired: false,
        error: OPENFX_NODE_ERROR_CODES.routeNotAllowed,
      };
    }
    if (!tool.requiresApproval) {
      const result = await executeReadTool(toolId, dependencies);
      return { ok: true, approvalRequired: false, result };
    }
    const validation = validateEffectInput(toolId, input, dependencies.ownPid());
    if (validation) {
      return { ok: false, approvalRequired: false, error: validation };
    }
    let approvedInput = input;
    if (toolId === "process.kill") {
      const identity = await dependencies.effects.inspectProcess(Number(input.pid));
      if (!identity || identity.pid !== input.pid) {
        return {
          ok: false,
          approvalRequired: false,
          error: "node_invalid_request",
        };
      }
      approvedInput = {
        pid: identity.pid,
        command: identity.command,
        startedAt: identity.startedAt,
      };
    }
    const action: ProposedAction = {
      id: dependencies.createId(),
      kind: "external_effect",
      title: `${toolId} requires approval`,
      target: toolId,
      preview: JSON.stringify(approvedInput),
      state: "draft",
    };
    const createdAt = dependencies.now();
    const preparedAction = dependencies.gate.prepareAction(action);
    const approval: BoundaryRequest = {
      id: dependencies.createId(),
      reason: `Agent requested ${toolId}`,
      action: preparedAction,
      parameterFingerprint: preparedAction.parameterFingerprint!,
      state: "pending",
      createdAt,
      expiresAt: createdAt + APPROVAL_TTL_MS,
    };
    await dependencies.approvals.registerRequest(
      approval,
      dependencies.nodeId(),
    );
    await dependencies.events?.approvalRequested(approval);
    return { ok: true, approvalRequired: true, approval };
  },

  async resolve(input) {
    const request = await dependencies.approvals.get(input.id);
    if (!request) {
      return {
        ok: false,
        applied: false,
        error: OPENFX_NODE_ERROR_CODES.approvalNotRegistered,
      };
    }
    if (request.parameterFingerprint !== input.parameterFingerprint) {
      return {
        ok: false,
        applied: false,
        error: OPENFX_NODE_ERROR_CODES.approvalFingerprintMismatch,
      };
    }
    let resolved: BoundaryRequest;
    try {
      resolved = await dependencies.gate.resolveBoundaryRequest(
        request,
        input.decision,
      );
    } catch (error) {
      return {
        ok: false,
        applied: false,
        error: error instanceof ApprovalGateError
          ? error.error.code
          : "approval_resolution_failed",
      };
    }
    if (resolved.parameterFingerprint !== input.parameterFingerprint) {
      return {
        ok: false,
        applied: false,
        error: OPENFX_NODE_ERROR_CODES.approvalFingerprintMismatch,
      };
    }
    await dependencies.events?.approvalResolved(resolved, input.decision);
    if (input.decision === "rejected") {
      return { ok: true, applied: false, request: resolved };
    }
    const application = await dependencies.gate.applyAction({
      action: resolved.action,
      parameterFingerprint: input.parameterFingerprint,
      apply: (action) => executeEffectTool(action, dependencies),
    });
    const appliedRequest: BoundaryRequest = {
      ...resolved,
      action: application.action,
    };
    await dependencies.approvals.recordApplicationOutcome(
      appliedRequest,
      application,
      dependencies.nodeId(),
    );
    return {
      ok: application.applied,
      applied: application.applied,
      request: appliedRequest,
      result: application.result,
      error: application.error?.code,
    };
  },

  listApprovals: () => dependencies.approvals.list(),
});

export const createMemoryApprovalRequestRepository = (): DesktopJournal => {
  return createDesktopJournal(createMemoryJournalStorage());
};

const executeReadTool = (
  toolId: string,
  dependencies: AgentToolRuntimeDependencies,
): Promise<unknown> => {
  switch (toolId) {
    case "system.getOverview":
      return dependencies.read.overview();
    case "process.list":
      return dependencies.read.processes();
    case "network.getStatus":
      return dependencies.read.network();
    case "relay.getStatus":
      return dependencies.read.relay();
    case "audit.list":
      return dependencies.audit.list();
    default:
      return Promise.reject(new Error(OPENFX_NODE_ERROR_CODES.routeNotAllowed));
  }
};

const executeEffectTool = (
  action: ProposedAction,
  dependencies: AgentToolRuntimeDependencies,
): Promise<unknown> => {
  const input = parseInput(action.preview);
  switch (action.target) {
    case "process.kill":
      return ensureNativeSuccess(dependencies.effects.kill(Number(input.pid), {
        pid: Number(input.pid),
        command: String(input.command),
        startedAt: String(input.startedAt),
      }));
    case "app.open":
      return ensureNativeSuccess(
        dependencies.effects.openApplication(String(input.application)),
      );
    case "relay.update":
      return ensureNativeSuccess(
        dependencies.effects.updateRelay(input.enabled === true),
      );
    default:
      return Promise.reject(new Error(OPENFX_NODE_ERROR_CODES.routeNotAllowed));
  }
};

const validateEffectInput = (
  toolId: string,
  input: Record<string, unknown>,
  ownPid: number,
): string | null => {
  const exact = (keys: string[]) =>
    Object.keys(input).length === keys.length &&
    keys.every((key) => key in input);
  switch (toolId) {
    case "process.kill":
      return exact(["pid"]) && Number.isSafeInteger(input.pid) &&
          Number(input.pid) > 1 && Number(input.pid) !== ownPid
        ? null
        : "node_invalid_request";
    case "app.open":
      return exact(["application"]) && typeof input.application === "string" &&
          isAllowedApplication(input.application)
        ? null
        : "node_invalid_request";
    case "relay.update":
      return exact(["enabled"]) && typeof input.enabled === "boolean"
        ? null
        : "node_invalid_request";
    default:
      return OPENFX_NODE_ERROR_CODES.routeNotAllowed;
  }
};

const ensureNativeSuccess = async (operation: Promise<unknown>): Promise<unknown> => {
  const result = await operation;
  if (
    result && typeof result === "object" &&
    (result as { ok?: unknown }).ok === false
  ) throw new Error("native_effect_failed");
  return result;
};

const parseInput = (preview: string | undefined): Record<string, unknown> => {
  try {
    const value = JSON.parse(preview ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};
