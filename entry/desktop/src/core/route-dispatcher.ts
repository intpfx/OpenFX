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

export interface DesktopRouteDependencies {
  overview(): Promise<unknown>;
  processes(): Promise<unknown>;
  network(): Promise<unknown>;
  relay(): Promise<unknown>;
  chat(
    message: string,
    onDelta: (delta: string) => void | Promise<void>,
  ): Promise<AgentChatResult>;
  agentDelta(input: {
    messageId: string;
    delta: string;
    sequence: number;
  }): Promise<void>;
  invokeTool(toolId: string, input: Record<string, unknown>): Promise<unknown>;
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
) => Promise<unknown>;

export const createDesktopRouteDispatcher = (
  dependencies: DesktopRouteDependencies,
  options: { createId?: () => string } = {},
): DesktopRouteDispatcher => {
  const messages: AgentMessage[] = [];
  let agent = { online: true, errorMessage: null as string | null };
  return async (request) => {
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
        return { ok: true, messages: messages.slice(), agent };
      case "POST /v1/agent/messages":
        return await postAgentMessage(request.body);
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
          ? await dependencies.invokeTool("relay.update", {
            enabled: input.enabled,
          })
          : invalidRequest();
      }
      default:
        return { ok: false, error: OPENFX_NODE_ERROR_CODES.routeNotAllowed };
    }
  };

  async function postAgentMessage(body: unknown): Promise<unknown> {
    const input = objectValue(body);
    if (
      !Object.keys(input).every((key) => ["message", "conversationId"].includes(key)) ||
      typeof input.message !== "string" || input.message.trim().length === 0 ||
      input.message.length > 16_384
    ) return invalidRequest();
    messages.push({
      role: "user",
      content: input.message,
      createdAt: Date.now(),
    });
    const clientMessageId = typeof input.conversationId === "string" &&
        input.conversationId.length > 0 && input.conversationId.length <= 128
      ? input.conversationId
      : null;
    try {
      const messageId = clientMessageId ?? options.createId?.() ?? crypto.randomUUID();
      let sequence = 0;
      const response = await dependencies.chat(input.message, async (delta) => {
        await dependencies.agentDelta({
          messageId,
          delta,
          sequence: ++sequence,
        });
      });
      agent = { online: true, errorMessage: null };
      const toolResults: unknown[] = [];
      for (const call of response.toolCalls) {
        toolResults.push(
          await dependencies.invokeTool(call.name, call.arguments),
        );
      }
      messages.push({
        role: "assistant",
        content: response.content,
        createdAt: Date.now(),
      });
      return {
        ok: true,
        message: response.content,
        ...(clientMessageId ? { messageId } : {}),
        toolResults,
        agent,
      };
    } catch (error) {
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
