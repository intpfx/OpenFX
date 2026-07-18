import {
  ApprovalGateError,
  SafetyActionGate,
} from "../../../../domains/e/src/core/safety-action-gate.ts";
import type {
  BoundaryRequest,
  ProposedAction,
} from "../../../../domains/e/src/core/types.ts";
import { OPENFX_NODE_ERROR_CODES } from "../../../../domains/_shared/openfx-node/constants.ts";
import type { AuditLog } from "./audit-log.ts";
import { findAgentTool } from "./agent-tools.ts";

export interface ApprovalRequestRepository {
  get(id: string): Promise<BoundaryRequest | null>;
  list(): Promise<BoundaryRequest[]>;
  save(request: BoundaryRequest): Promise<void>;
}

export interface AgentReadTools {
  overview(): Promise<unknown>;
  processes(): Promise<unknown>;
  network(): Promise<unknown>;
  relay(): Promise<unknown>;
}

export interface AgentEffectTools {
  kill(pid: number): Promise<unknown>;
  openApplication(application: string): Promise<unknown>;
  updateRelay(enabled: boolean): Promise<unknown>;
}

export interface AgentToolRuntimeDependencies {
  gate: SafetyActionGate;
  approvals: ApprovalRequestRepository;
  audit: AuditLog;
  nodeId(): string;
  now(): number;
  createId(): string;
  read: AgentReadTools;
  effects: AgentEffectTools;
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
    const validation = validateEffectInput(toolId, input);
    if (validation) {
      return { ok: false, approvalRequired: false, error: validation };
    }
    const action: ProposedAction = {
      id: dependencies.createId(),
      kind: "external_effect",
      title: `${toolId} requires approval`,
      target: toolId,
      preview: JSON.stringify(input),
      state: "draft",
    };
    const approval = await dependencies.gate.createBoundaryRequest(
      `Agent requested ${toolId}`,
      action,
    );
    await dependencies.approvals.save(approval);
    await dependencies.audit.append({
      nodeId: dependencies.nodeId(),
      category: "approval",
      action: `${toolId}.requested`,
      outcome: "succeeded",
      subjectId: approval.id,
      metadata: { parameterFingerprint: approval.parameterFingerprint },
    });
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
    await dependencies.approvals.save(resolved);
    if (input.decision === "rejected") {
      await dependencies.audit.append({
        nodeId: dependencies.nodeId(),
        category: "approval",
        action: `${resolved.action.target}.rejected`,
        outcome: "rejected",
        subjectId: resolved.id,
      });
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
    await dependencies.approvals.save(appliedRequest);
    await dependencies.audit.append({
      nodeId: dependencies.nodeId(),
      category: "approval",
      action: `${resolved.action.target}.${application.applied ? "applied" : "failed"}`,
      outcome: application.applied ? "succeeded" : "failed",
      subjectId: resolved.id,
      metadata: application.error ? { error: application.error.code } : undefined,
    });
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

export const createMemoryApprovalRequestRepository = (): ApprovalRequestRepository => {
  const requests = new Map<string, BoundaryRequest>();
  return {
    get(id) {
      const request = requests.get(id);
      return Promise.resolve(request ? structuredClone(request) : null);
    },
    list() {
      return Promise.resolve(
        [...requests.values()].sort((a, b) => a.createdAt - b.createdAt).map((
          request,
        ) => structuredClone(request)),
      );
    },
    save(request) {
      requests.set(request.id, structuredClone(request));
      return Promise.resolve();
    },
  };
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
      return dependencies.effects.kill(Number(input.pid));
    case "app.open":
      return dependencies.effects.openApplication(String(input.application));
    case "relay.update":
      return dependencies.effects.updateRelay(input.enabled === true);
    default:
      return Promise.reject(new Error(OPENFX_NODE_ERROR_CODES.routeNotAllowed));
  }
};

const validateEffectInput = (
  toolId: string,
  input: Record<string, unknown>,
): string | null => {
  const exact = (keys: string[]) =>
    Object.keys(input).length === keys.length &&
    keys.every((key) => key in input);
  switch (toolId) {
    case "process.kill":
      return exact(["pid"]) && Number.isSafeInteger(input.pid) &&
          Number(input.pid) > 1
        ? null
        : "node_invalid_request";
    case "app.open":
      return exact(["application"]) && typeof input.application === "string" &&
          input.application.trim().length > 0
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

const parseInput = (preview: string | undefined): Record<string, unknown> => {
  try {
    const value = JSON.parse(preview ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};
