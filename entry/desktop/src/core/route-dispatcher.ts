import { OPENFX_NODE_ERROR_CODES } from "../../../../domains/_shared/openfx-node/constants.ts";
import type { SignableNodeRequest } from "../../../../domains/_shared/openfx-node/request-signing.ts";

export interface AgentChatResult {
  content: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export interface AgentToolResult {
  toolCallId: string;
  content: string;
}

export interface AgentToolRound {
  assistant: AgentChatResult;
  toolResults: AgentToolResult[];
}

export interface AgentChatExecutionOptions {
  deadlineAt: number;
  signal?: AbortSignal;
}

export interface DesktopRouteDependencies {
  overview(): Promise<unknown>;
  processes(): Promise<unknown>;
  network(): Promise<unknown>;
  relay(): Promise<unknown>;
  chat(
    message: string,
    onDelta: (delta: string) => void | Promise<void>,
    toolRounds?: AgentToolRound[],
    options?: AgentChatExecutionOptions,
  ): Promise<AgentChatResult>;
  agentDelta(input: {
    messageId: string;
    delta: string;
    sequence: number;
  }): Promise<void>;
  invokeTool(
    toolId: string,
    input: Record<string, unknown>,
    options?: AgentChatExecutionOptions,
  ): Promise<unknown>;
  listApprovals(): Promise<unknown>;
  resolveApproval(input: {
    id: string;
    decision: "approved" | "rejected";
    parameterFingerprint: string;
  }): Promise<unknown>;
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export type DesktopRouteDispatcher = (
  request: SignableNodeRequest,
  signal?: AbortSignal,
) => Promise<unknown>;

const MAX_AGENT_HISTORY_MESSAGES = 30;
const MAX_AGENT_HISTORY_BYTES = 240 * 1024;
const MAX_AGENT_CONTENT_BYTES = 128 * 1024;
const MAX_AGENT_TOOL_ROUNDS = 3;
const MAX_AGENT_TOOL_CALLS = 12;
const MAX_TOOL_RESULT_BYTES = 128 * 1024;
const MAX_TOOL_RESULTS_TOTAL_BYTES = 256 * 1024;
const MAX_CLIENT_TOOL_PREVIEW_BYTES = 4 * 1024;
const MAX_CLIENT_TOOL_PREVIEWS_TOTAL_BYTES = 32 * 1024;
const MAX_AGENT_TURN_MS = 30_000;
const textEncoder = new TextEncoder();

export const createDesktopRouteDispatcher = (
  dependencies: DesktopRouteDependencies,
  options: { createId?: () => string; agentTurnMs?: number } = {},
): DesktopRouteDispatcher => {
  const historyTurns: AgentMessage[][] = [];
  let agent = { online: true, errorMessage: null as string | null };
  return async (request, signal) => {
    const route = `${request.method.toUpperCase()} ${request.path}`;
    switch (route) {
      case "GET /v1/system/overview":
        return {
          ok: true,
          overview: await dependencies.overview(),
          network: await dependencies.network(),
          relay: await dependencies.relay(),
        };
      case "GET /v1/processes":
        return { ok: true, processes: await dependencies.processes() };
      case "GET /v1/agent/messages":
        return { ok: true, messages: historyTurns.flat(), agent };
      case "POST /v1/agent/messages":
        return await postAgentMessage(request.body, signal);
      case "GET /v1/approvals":
        return { ok: true, approvals: await dependencies.listApprovals() };
      case "POST /v1/approvals/resolve": {
        const input = objectValue(request.body);
        if (
          typeof input.id !== "string" ||
          (input.decision !== "approved" && input.decision !== "rejected") ||
          typeof input.parameterFingerprint !== "string"
        ) return invalidRequest();
        return await dependencies.resolveApproval({
          id: input.id,
          decision: input.decision,
          parameterFingerprint: input.parameterFingerprint,
        });
      }
      case "GET /v1/relay":
        return { ok: true, relay: await dependencies.relay() };
      case "POST /v1/relay": {
        const input = objectValue(request.body);
        return Object.keys(input).length === 1 &&
            typeof input.enabled === "boolean"
          ? await dependencies.invokeTool(
            "relay.update",
            { enabled: input.enabled },
            {
              deadlineAt: Date.now() + 8_000,
              signal,
            },
          )
          : invalidRequest();
      }
      default:
        return { ok: false, error: OPENFX_NODE_ERROR_CODES.routeNotAllowed };
    }
  };

  async function postAgentMessage(
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const input = objectValue(body);
    if (
      !Object.keys(input).every((key) => ["message", "conversationId"].includes(key)) ||
      typeof input.message !== "string" || input.message.trim().length === 0 ||
      input.message.length > 16_384
    ) return invalidRequest();
    const userMessage: AgentMessage = {
      role: "user",
      content: input.message,
      createdAt: Date.now(),
    };
    const clientMessageId = typeof input.conversationId === "string" &&
        input.conversationId.length > 0 && input.conversationId.length <= 128
      ? input.conversationId
      : null;
    try {
      const deadlineAt = Date.now() + normalizeAgentTurnMs(options.agentTurnMs);
      const execution = { deadlineAt, signal };
      assertTurnActive(deadlineAt, signal);
      const messageId = clientMessageId ?? options.createId?.() ?? crypto.randomUUID();
      let sequence = 0;
      const onDelta = async (delta: string) => {
        assertTurnActive(deadlineAt, signal);
        await awaitTurn(
          dependencies.agentDelta({
            messageId,
            delta,
            sequence: ++sequence,
          }),
          deadlineAt,
          signal,
        );
        assertTurnActive(deadlineAt, signal);
      };
      const toolRounds: AgentToolRound[] = [];
      const clientToolResults: unknown[] = [];
      const seenToolCalls = new Set<string>();
      let toolCallCount = 0;
      let toolResultBytes = 0;
      let clientPreviewBytes = 0;
      let response = await awaitTurn(
        dependencies.chat(input.message, onDelta, toolRounds, execution),
        deadlineAt,
        signal,
      );
      assertTurnActive(deadlineAt, signal);
      for (
        let roundIndex = 0;
        response.toolCalls.length > 0;
        roundIndex += 1
      ) {
        if (roundIndex >= MAX_AGENT_TOOL_ROUNDS) {
          throw new Error("agent_tool_round_limit");
        }
        const roundResults: AgentToolResult[] = [];
        for (const call of response.toolCalls) {
          assertTurnActive(deadlineAt, signal);
          toolCallCount += 1;
          if (toolCallCount > MAX_AGENT_TOOL_CALLS) {
            throw new Error("agent_tool_call_limit");
          }
          if (seenToolCalls.has(call.id)) {
            throw new Error("agent_tool_call_repeated");
          }
          seenToolCalls.add(call.id);
          const remaining = MAX_TOOL_RESULTS_TOTAL_BYTES - toolResultBytes;
          if (remaining < 256) throw new Error("agent_tool_result_limit");
          const result = await awaitTurn(
            dependencies.invokeTool(call.name, call.arguments, execution),
            deadlineAt,
            signal,
          );
          assertTurnActive(deadlineAt, signal);
          const content = boundedJson(
            result,
            Math.min(MAX_TOOL_RESULT_BYTES, remaining),
          );
          toolResultBytes += encodedBytes(content);
          roundResults.push({ toolCallId: call.id, content });

          const previewRemaining = MAX_CLIENT_TOOL_PREVIEWS_TOTAL_BYTES -
            clientPreviewBytes;
          if (previewRemaining > 0) {
            const preview = truncateUtf8(
              content,
              Math.min(MAX_CLIENT_TOOL_PREVIEW_BYTES, previewRemaining),
            );
            clientPreviewBytes += encodedBytes(preview);
            clientToolResults.push({
              toolCallId: call.id,
              name: call.name,
              content: preview,
              truncated: preview !== content,
            });
          }
        }
        toolRounds.push({ assistant: response, toolResults: roundResults });
        response = await awaitTurn(
          dependencies.chat(input.message, onDelta, toolRounds, execution),
          deadlineAt,
          signal,
        );
        assertTurnActive(deadlineAt, signal);
      }
      if (encodedBytes(response.content) > MAX_AGENT_CONTENT_BYTES) {
        throw new Error("agent_response_too_large");
      }
      agent = { online: true, errorMessage: null };
      const visibleContent = response.content ||
        (toolRounds.length > 0 ? "工具执行完成。" : "Agent 未返回内容。");
      const assistantMessage: AgentMessage = {
        role: "assistant",
        content: visibleContent,
        createdAt: Date.now(),
      };
      appendHistoryTurn(historyTurns, [userMessage, assistantMessage]);
      return {
        ok: true,
        message: visibleContent,
        ...(clientMessageId ? { messageId } : {}),
        toolResults: clientToolResults,
        agent,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      appendHistoryTurn(historyTurns, [userMessage]);
      agent = {
        online: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      return {
        ok: false,
        error: "agent_offline",
        ...(clientMessageId ? { messageId: clientMessageId } : {}),
        agent,
      };
    }
  }
};

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const invalidRequest = () => ({
  ok: false,
  error: OPENFX_NODE_ERROR_CODES.invalidRequest,
});

const appendHistoryTurn = (
  historyTurns: AgentMessage[][],
  turn: AgentMessage[],
): void => {
  historyTurns.push(turn);
  while (historyTurns.length > 1) {
    const messages = historyTurns.flat();
    if (
      messages.length <= MAX_AGENT_HISTORY_MESSAGES &&
      encodedBytes(JSON.stringify(messages)) <= MAX_AGENT_HISTORY_BYTES
    ) break;
    historyTurns.shift();
  }
};

const boundedJson = (value: unknown, maxBytes: number): string => {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? "null";
  } catch {
    serialized = JSON.stringify({ ok: false, error: "tool_result_not_serializable" });
  }
  if (encodedBytes(serialized) <= maxBytes) return serialized;
  const marker = { truncated: true, preview: "" };
  const markerBytes = encodedBytes(JSON.stringify(marker));
  marker.preview = truncateUtf8(serialized, Math.max(0, maxBytes - markerBytes - 8));
  while (marker.preview && encodedBytes(JSON.stringify(marker)) > maxBytes) {
    marker.preview = marker.preview.slice(0, -1);
  }
  return JSON.stringify(marker);
};

const truncateUtf8 = (value: string, maxBytes: number): string => {
  if (maxBytes <= 0) return "";
  const bytes = textEncoder.encode(value);
  if (bytes.byteLength <= maxBytes) return value;
  for (let end = maxBytes; end > Math.max(0, maxBytes - 4); end -= 1) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, end));
    } catch {
      // Retry without the incomplete trailing UTF-8 code point.
    }
  }
  return "";
};

const encodedBytes = (value: string): number => textEncoder.encode(value).byteLength;

const assertTurnActive = (deadlineAt: number, signal?: AbortSignal): void => {
  if (signal?.aborted) throw new Error("agent_turn_aborted");
  if (Date.now() >= deadlineAt) throw new Error("agent_turn_deadline");
};

const normalizeAgentTurnMs = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(value, MAX_AGENT_TURN_MS)
    : MAX_AGENT_TURN_MS;

const awaitTurn = <Value>(
  promise: Promise<Value>,
  deadlineAt: number,
  signal?: AbortSignal,
): Promise<Value> => {
  const remainingMs = deadlineAt - Date.now();
  if (signal?.aborted || remainingMs <= 0) {
    promise.then(() => {}, () => {});
    return Promise.reject(
      new Error(signal?.aborted ? "agent_turn_aborted" : "agent_turn_deadline"),
    );
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const rejectOnce = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = (): void => rejectOnce(new Error("agent_turn_aborted"));
    const timer = setTimeout(
      () => rejectOnce(new Error("agent_turn_deadline")),
      remainingMs,
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
};
