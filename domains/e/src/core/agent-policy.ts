import type {
  AgentDecision,
  KernelError,
  MemoryEntry,
  ProposedAction,
} from "./types.ts";

export interface AgentPolicyOptions {
  allowedTools?: string[];
  highRiskTools?: string[];
  allowedPathPrefixes?: string[];
  approvalCacheTtlMs?: number;
  memoryBudget?: number;
}

export interface AgentPolicyDecision {
  blocked?: KernelError;
  overrideDecision?: AgentDecision;
}

export class AgentPolicy {
  readonly #allowedTools: Set<string> | null;
  readonly #highRiskTools: Set<string>;
  readonly #allowedPathPrefixes: string[];
  readonly approvalCacheTtlMs: number;
  readonly memoryBudget: number;

  constructor(options: AgentPolicyOptions = {}) {
    this.#allowedTools = options.allowedTools ? new Set(options.allowedTools) : null;
    this.#highRiskTools = new Set(options.highRiskTools ?? []);
    this.#allowedPathPrefixes = options.allowedPathPrefixes ?? [];
    this.approvalCacheTtlMs = options.approvalCacheTtlMs ?? 300_000;
    this.memoryBudget = options.memoryBudget ?? 5;
  }

  rankMemories(memories: MemoryEntry[], budget = this.memoryBudget): MemoryEntry[] {
    return [...memories]
      .sort((a, b) => b.salience - a.salience || b.createdAt - a.createdAt)
      .slice(0, budget);
  }

  evaluateDecision(decision: AgentDecision): AgentPolicyDecision {
    if (decision.kind !== "call_tool") {
      return {};
    }

    if (this.#allowedTools && !this.#allowedTools.has(decision.toolName)) {
      return {
        blocked: {
          code: "tool_blocked_by_policy",
          message: `Tool is not allowed by AgentPolicy: ${decision.toolName}`,
        },
      };
    }

    const pathTarget = extractPathTarget(decision.args);
    if (pathTarget && !this.#isAllowedPath(pathTarget)) {
      return {
        blocked: {
          code: "path_blocked_by_policy",
          message: `Path is not allowed by AgentPolicy: ${pathTarget}`,
        },
      };
    }

    if (this.#highRiskTools.has(decision.toolName)) {
      return {
        overrideDecision: {
          kind: "request_boundary",
          reason:
            `AgentPolicy requires approval for high-risk tool: ${decision.toolName}`,
          action: highRiskToolAction(decision.toolName, decision.args),
        },
      };
    }

    return {};
  }

  #isAllowedPath(target: string): boolean {
    if (this.#allowedPathPrefixes.length === 0) {
      return true;
    }
    return this.#allowedPathPrefixes.some((prefix) => target.startsWith(prefix));
  }
}

export function createDefaultAgentPolicy(): AgentPolicy {
  return new AgentPolicy();
}

function highRiskToolAction(toolName: string, args: unknown): ProposedAction {
  return {
    id: `policy:${toolName}`,
    kind: "external_effect",
    title: `Approve ${toolName}`,
    target: `tool://${toolName}`,
    preview: JSON.stringify(args),
    state: "ready",
  };
}

function extractPathTarget(args: unknown): string | null {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return null;
  }
  const record = args as Record<string, unknown>;
  const candidate = record.path ?? record.target ?? record.uri;
  return typeof candidate === "string" ? candidate : null;
}
