import type { NodeAvailability } from "./model.ts";

export type ConsoleFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ConsoleRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export class ConsoleClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly payload: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    payload: Record<string, unknown>,
  ) {
    super(consoleErrorLabel(code));
    this.name = "ConsoleClientError";
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

export function createConsoleClient(
  fetcher: ConsoleFetch = fetch,
  onUnauthorized: () => void = () => undefined,
): { request: ConsoleRequest } {
  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const response = await fetcher(path, {
        credentials: "same-origin",
        ...init,
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
      });
      const parsed = await response.json().catch(() => ({}));
      const payload = isRecord(parsed) ? parsed : {};
      if (!response.ok || payload.ok === false) {
        const code = typeof payload.error === "string"
          ? payload.error
          : "request_failed";
        const error = new ConsoleClientError(code, response.status, payload);
        if (response.status === 401 || code === "unauthorized") {
          onUnauthorized();
        }
        throw error;
      }
      return payload as T;
    },
  };
}

export function consoleErrorLabel(code: string): string {
  const labels: Record<string, string> = {
    unauthorized: "会话无效，请重新登录",
    rate_limited: "尝试次数过多，请稍后再试",
    admin_not_configured: "服务端尚未配置管理密钥",
    node_unpaired: "尚未配对 Mac 节点",
    node_offline: "Mac 节点当前离线",
    node_relay_unavailable: "远程接入暂不可用",
    control_plane_unavailable: "控制面存储暂不可用",
    kv_unavailable: "当前运行时无法访问 Deno KV",
    agent_offline: "Agent 当前不可用",
    approval_expired: "审批已过期",
    approval_fingerprint_mismatch: "审批参数已变化，请刷新后重试",
    approval_already_resolved: "审批已经处理",
    approval_resolution_failed: "审批处理失败",
    native_effect_failed: "节点执行失败",
    effect_failed: "节点执行失败",
  };
  return labels[code] ?? code.replaceAll("_", " ");
}

export type AgentTurn = {
  messageId: string;
  lastSequence: number;
  text: string;
};

export type AgentDelta = {
  messageId: string;
  sequence: number;
  delta: string;
};

export const createAgentTurn = (messageId: string): AgentTurn => ({
  messageId,
  lastSequence: 0,
  text: "",
});

export function appendAgentDelta(
  turn: AgentTurn,
  delta: AgentDelta,
): AgentTurn {
  if (
    delta.messageId !== turn.messageId ||
    delta.sequence !== turn.lastSequence + 1 ||
    !delta.delta
  ) return turn;
  return {
    ...turn,
    lastSequence: delta.sequence,
    text: turn.text + delta.delta,
  };
}

export const buildEventStreamUrl = (): string => "/api/console/events?after=latest";

export type ConsoleMemory = {
  availability: NodeAvailability;
  overview: unknown | null;
  relay: unknown | null;
  processes: unknown[];
  telemetry: unknown[];
  messages: unknown[];
  approvals: unknown[];
  audit: unknown[];
  pairing: unknown | null;
  agentTurn: AgentTurn | null;
  nodeDataStale: boolean;
};

export const emptyConsoleMemory = (): ConsoleMemory => ({
  availability: "unknown",
  overview: null,
  relay: null,
  processes: [],
  telemetry: [],
  messages: [],
  approvals: [],
  audit: [],
  pairing: null,
  agentTurn: null,
  nodeDataStale: false,
});

export const isConsoleLogoutMessage = (value: unknown): boolean =>
  isRecord(value) && value.type === "logout";

export function handleConsoleSessionMessage(
  value: unknown,
  reset: () => void,
): boolean {
  if (!isConsoleLogoutMessage(value)) return false;
  reset();
  return true;
}

export type ApprovalResolution = {
  ok?: boolean;
  applied?: boolean;
};

export function approvalRefreshPlan(
  result: ApprovalResolution,
  decision: "approved" | "rejected",
): string[] {
  if (decision === "approved" && result.ok === true && result.applied === true) {
    return ["approvals", "overview", "relay", "processes", "telemetry"];
  }
  return ["approvals"];
}

export async function refreshAfterApproval(
  result: ApprovalResolution,
  decision: "approved" | "rejected",
  refreshers: Record<string, () => Promise<void>>,
): Promise<string[]> {
  const plan = approvalRefreshPlan(result, decision);
  await Promise.allSettled(plan.map((name) => refreshers[name]()));
  return plan;
}

export function heartbeatRefreshPlan(availability: NodeAvailability): {
  availability: NodeAvailability;
  stale: boolean;
  refresh: boolean;
} {
  return {
    availability,
    stale: availability !== "online",
    refresh: availability === "online",
  };
}

export async function applyHeartbeatTransition(
  availability: NodeAvailability,
  effects: {
    setAvailability: (availability: NodeAvailability) => void;
    setStale: (stale: boolean) => void;
    refreshNodeData: () => Promise<void>;
  },
): Promise<ReturnType<typeof heartbeatRefreshPlan>> {
  const plan = heartbeatRefreshPlan(availability);
  effects.setAvailability(plan.availability);
  effects.setStale(plan.stale);
  if (plan.refresh) await effects.refreshNodeData();
  return plan;
}

export const parseAgentDelta = (value: unknown): AgentDelta | null => {
  if (!isRecord(value)) return null;
  return typeof value.messageId === "string" &&
      typeof value.delta === "string" &&
      Number.isSafeInteger(value.sequence)
    ? {
      messageId: value.messageId,
      delta: value.delta,
      sequence: value.sequence as number,
    }
    : null;
};

export type SessionGeneration = {
  activate(): void;
  invalidate(): void;
  capture(): number;
  isCurrent(ticket: number): boolean;
  isAuthenticated(ticket: number): boolean;
  commit(ticket: number, effect: () => void): boolean;
};

export function createSessionGeneration(): SessionGeneration {
  let generation = 0;
  let authenticated = false;
  const advance = () => {
    generation += 1;
  };
  const isCurrent = (ticket: number) => ticket === generation;
  return {
    activate() {
      authenticated = true;
      advance();
    },
    invalidate() {
      authenticated = false;
      advance();
    },
    capture: () => generation,
    isCurrent,
    isAuthenticated: (ticket) => authenticated && isCurrent(ticket),
    commit(ticket, effect) {
      if (!authenticated || !isCurrent(ticket)) return false;
      effect();
      return true;
    },
  };
}

export class ConsoleStaleRequestError extends Error {
  constructor() {
    super("stale_authenticated_request");
    this.name = "ConsoleStaleRequestError";
  }
}

export function createAuthenticatedConsoleRequest(
  request: ConsoleRequest,
  session: SessionGeneration,
  onUnauthorized: () => void = () => undefined,
): ConsoleRequest {
  return async <T>(path: string, init?: RequestInit): Promise<T> => {
    const ticket = session.capture();
    if (!session.isAuthenticated(ticket)) throw new ConsoleStaleRequestError();
    try {
      const payload = await request<T>(path, init);
      if (!session.isAuthenticated(ticket)) throw new ConsoleStaleRequestError();
      return payload;
    } catch (error) {
      if (!session.isAuthenticated(ticket)) throw new ConsoleStaleRequestError();
      if (error instanceof ConsoleClientError && error.status === 401) {
        onUnauthorized();
      }
      throw error;
    }
  };
}

export type AgentTurnCompletionGate = {
  begin(messageId: string): void;
  reset(): void;
  isCurrent(messageId: string): boolean;
  complete(
    messageId: string,
    returnedMessageId: unknown,
    effect: () => void,
  ): boolean;
};

export function createAgentTurnCompletionGate(): AgentTurnCompletionGate {
  let currentMessageId: string | null = null;
  const isCurrent = (messageId: string) => currentMessageId === messageId;
  return {
    begin(messageId) {
      currentMessageId = messageId;
    },
    reset() {
      currentMessageId = null;
    },
    isCurrent,
    complete(messageId, returnedMessageId, effect) {
      if (!isCurrent(messageId) || returnedMessageId !== messageId) return false;
      effect();
      return true;
    },
  };
}

export function resolveAgentCompletionMessageId(
  error: unknown,
  originatingMessageId: string,
): string {
  const returnedMessageId = error instanceof ConsoleClientError
    ? error.payload.messageId
    : undefined;
  return typeof returnedMessageId === "string" && returnedMessageId.length > 0
    ? returnedMessageId
    : originatingMessageId;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
