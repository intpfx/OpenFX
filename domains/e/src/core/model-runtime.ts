import type { AgentDecision, ModelRole, ModelRoute, ReasoningTrace } from "./types.ts";

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoningContent?: string;
  toolCalls?: ModelToolCall[];
  toolCallId?: string;
}

export interface ModelRequest {
  role: ModelRole;
  messages: ModelMessage[];
  repairOf?: string;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export interface ModelResponse {
  content: string;
  route: ModelRoute;
  reasoningTrace?: ReasoningTrace;
  toolCalls?: ModelToolCall[];
}

export interface ModelRuntime {
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export interface ModelToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ProviderModelResponse {
  content: string;
  reasoning?: string;
  rawReasoning?: unknown;
  messageStitching?: string;
  toolCalls?: ModelToolCall[];
}

export interface ModelProvider {
  provider: string;
  modelId: string;
  complete(request: ModelRequest): Promise<ProviderModelResponse>;
}

export interface ModelRuntimeRouteConfig {
  role: ModelRole;
  providers: ModelProvider[];
  tokenBudget: number;
  latencyBudgetMs?: number;
}

export class RoutedModelRuntime implements ModelRuntime {
  readonly #routes = new Map<ModelRole, ModelRuntimeRouteConfig>();

  constructor(routes: ModelRuntimeRouteConfig[]) {
    for (const route of routes) {
      this.#routes.set(route.role, route);
    }
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const config = this.#routes.get(request.role) ?? this.#routes.get("default");
    if (!config || config.providers.length === 0) {
      throw new Error(`No model route configured for role: ${request.role}`);
    }

    const failures: string[] = [];
    for (const provider of config.providers) {
      try {
        const response = await provider.complete(request);
        const reasoningTrace = normalizeReasoningTrace(response);
        return {
          content: response.content,
          reasoningTrace,
          toolCalls: response.toolCalls,
          route: createModelRoute(request.role, {
            provider: provider.provider,
            modelId: provider.modelId,
            fallbackChain: config.providers.map((candidate) => candidate.modelId),
            tokenBudget: config.tokenBudget,
            latencyBudgetMs: config.latencyBudgetMs,
            fallbackOccurred: failures.length > 0,
            messageStitching: response.messageStitching,
            reasoningTrace,
          }),
        };
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    throw new Error(`All model providers failed: ${failures.join("; ")}`);
  }
}

export class StaticModelRuntime implements ModelRuntime {
  readonly #responses: string[];
  #index = 0;

  constructor(responses: Array<string | AgentDecision>) {
    this.#responses = responses.map((response) =>
      typeof response === "string" ? response : JSON.stringify(response)
    );
  }

  complete(request: ModelRequest): Promise<ModelResponse> {
    const content =
      this.#responses[Math.min(this.#index, this.#responses.length - 1)] ??
        JSON.stringify({ kind: "complete", result: "" });
    this.#index += 1;

    return Promise.resolve({
      content,
      route: createModelRoute(request.role),
    });
  }
}

export class StaticModelProvider implements ModelProvider {
  readonly provider: string;
  readonly modelId: string;
  readonly #responses: Array<ProviderModelResponse | Error>;
  #index = 0;

  constructor(
    options: {
      provider?: string;
      modelId?: string;
      responses: Array<string | ProviderModelResponse | Error>;
    },
  ) {
    this.provider = options.provider ?? "static";
    this.modelId = options.modelId ?? "static-mock";
    this.#responses = options.responses.map((response) =>
      typeof response === "string" ? { content: response } : response
    );
  }

  complete(_request: ModelRequest): Promise<ProviderModelResponse> {
    const response =
      this.#responses[Math.min(this.#index, this.#responses.length - 1)] ??
        { content: "" };
    this.#index += 1;

    if (response instanceof Error) {
      return Promise.reject(response);
    }

    return Promise.resolve(response);
  }
}

export function createModelRoute(
  role: ModelRole,
  overrides: Partial<ModelRoute> = {},
): ModelRoute {
  return {
    role,
    provider: "static",
    modelId: "static-mock",
    fallbackChain: [],
    tokenBudget: 4096,
    fallbackOccurred: false,
    ...overrides,
  };
}

export function normalizeReasoningTrace(
  response: ProviderModelResponse,
): ReasoningTrace {
  if (typeof response.reasoning === "string" && response.reasoning.length > 0) {
    return { kind: "summary", content: response.reasoning };
  }

  if (response.rawReasoning !== undefined) {
    return { kind: "provider_trace", content: JSON.stringify(response.rawReasoning) };
  }

  return { kind: "none" };
}
