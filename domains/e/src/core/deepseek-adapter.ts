import type {
  ModelMessage,
  ModelProvider,
  ModelRequest,
  ModelToolCall,
  ProviderModelResponse,
} from "./model-runtime.ts";

export type DeepSeekThinkingMode = "enabled" | "disabled";
export type DeepSeekReasoningEffort = "high" | "max";

export interface DeepSeekProviderOptions {
  apiKey: string;
  modelId?: string;
  baseUrl?: string;
  thinking?: DeepSeekThinkingMode;
  reasoningEffort?: DeepSeekReasoningEffort;
  fetcher?: typeof fetch;
}

export interface DeepSeekChatRequest {
  model: string;
  messages: DeepSeekMessage[];
  reasoning_effort?: DeepSeekReasoningEffort;
  extra_body?: {
    thinking: { type: DeepSeekThinkingMode };
  };
}

export type DeepSeekMessage =
  | {
    role: "system" | "user";
    content: string;
  }
  | {
    role: "assistant";
    content: string;
    reasoning_content?: string;
    tool_calls?: ModelToolCall[];
  }
  | {
    role: "tool";
    content: string;
    tool_call_id?: string;
  };

export class DeepSeekProvider implements ModelProvider {
  readonly provider = "deepseek";
  readonly modelId: string;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #thinking: DeepSeekThinkingMode;
  readonly #reasoningEffort: DeepSeekReasoningEffort;
  readonly #fetcher: typeof fetch;

  constructor(options: DeepSeekProviderOptions) {
    this.modelId = options.modelId ?? "deepseek-v4-pro";
    this.#apiKey = options.apiKey;
    this.#baseUrl = options.baseUrl ?? "https://api.deepseek.com";
    this.#thinking = options.thinking ?? "enabled";
    this.#reasoningEffort = options.reasoningEffort ?? "high";
    this.#fetcher = options.fetcher ?? fetch;
  }

  async complete(request: ModelRequest): Promise<ProviderModelResponse> {
    const body = buildDeepSeekChatRequest(request, {
      modelId: this.modelId,
      thinking: this.#thinking,
      reasoningEffort: normalizeDeepSeekReasoningEffort(
        request.reasoningEffort ?? this.#reasoningEffort,
      ),
    });

    const response = await this.#fetcher(`${this.#baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${this.#apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `DeepSeek request failed: ${response.status} ${await response.text()}`,
      );
    }

    return parseDeepSeekChatResponse(await response.json());
  }
}

export function buildDeepSeekChatRequest(
  request: ModelRequest,
  options: {
    modelId: string;
    thinking?: DeepSeekThinkingMode;
    reasoningEffort?: DeepSeekReasoningEffort | ModelRequest["reasoningEffort"];
  },
): DeepSeekChatRequest {
  const thinking = options.thinking ?? "enabled";
  return {
    model: options.modelId,
    messages: request.messages.map(toDeepSeekMessage),
    reasoning_effort: thinking === "enabled"
      ? normalizeDeepSeekReasoningEffort(
        request.reasoningEffort ?? options.reasoningEffort ?? "high",
      )
      : undefined,
    extra_body: {
      thinking: { type: thinking },
    },
  };
}

export function parseDeepSeekChatResponse(value: unknown): ProviderModelResponse {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    throw new Error("Invalid DeepSeek response: choices missing.");
  }

  const firstChoice = value.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new Error("Invalid DeepSeek response: message missing.");
  }

  const message = firstChoice.message;
  return {
    content: typeof message.content === "string" ? message.content : "",
    reasoning: typeof message.reasoning_content === "string"
      ? message.reasoning_content
      : undefined,
    rawReasoning: message.reasoning_content,
    toolCalls: isModelToolCalls(message.tool_calls) ? message.tool_calls : undefined,
    messageStitching: message.tool_calls
      ? "deepseek-tool-subturn-requires-reasoning-content"
      : "deepseek-standard",
  };
}

export function toDeepSeekMessage(message: ModelMessage): DeepSeekMessage {
  if (message.role === "assistant") {
    const deepSeekMessage: DeepSeekMessage = {
      role: "assistant",
      content: message.content,
    };

    if (message.reasoningContent) {
      deepSeekMessage.reasoning_content = message.reasoningContent;
    }

    if (message.toolCalls?.length) {
      deepSeekMessage.tool_calls = message.toolCalls;
    }

    return deepSeekMessage;
  }

  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId,
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

export function stitchDeepSeekAssistantMessage(
  response: ProviderModelResponse,
): ModelMessage {
  return {
    role: "assistant",
    content: response.content,
    reasoningContent: response.reasoning,
    toolCalls: response.toolCalls,
  };
}

export function normalizeDeepSeekReasoningEffort(
  effort: ModelRequest["reasoningEffort"] | DeepSeekReasoningEffort,
): DeepSeekReasoningEffort {
  if (effort === "max" || effort === "xhigh") {
    return "max";
  }

  return "high";
}

function isModelToolCalls(value: unknown): value is ModelToolCall[] {
  return Array.isArray(value) &&
    value.every((item) =>
      isRecord(item) &&
      typeof item.id === "string" &&
      item.type === "function" &&
      isRecord(item.function) &&
      typeof item.function.name === "string" &&
      typeof item.function.arguments === "string"
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
