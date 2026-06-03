import type {
  AgentDecision,
  EventEngineRecord,
  EventEngineResult,
  EventSignal,
  KernelError,
} from "./types.ts";

export interface EventContext<TPayload = unknown> {
  type: string;
  payload: TPayload;
}

export interface EventHandler<TPayload = unknown> {
  id: string;
  privileged?: boolean;
  handle(context: EventContext<TPayload>): Promise<EventSignal> | EventSignal;
}

export interface EventEngineOptions {
  tokenBudget?: number;
  blockOnHandlerError?: boolean;
}

export class EventEngine {
  readonly #handlers: EventHandler[];
  readonly #tokenBudget: number;
  readonly #blockOnHandlerError: boolean;

  constructor(handlers: EventHandler[], options: EventEngineOptions = {}) {
    this.#handlers = handlers;
    this.#tokenBudget = options.tokenBudget ?? 1024;
    this.#blockOnHandlerError = options.blockOnHandlerError ?? false;
  }

  async emit<TPayload>(
    type: string,
    payload: TPayload,
  ): Promise<EventEngineResult<TPayload>> {
    const records: EventEngineRecord[] = [];
    let currentPayload = payload;
    let currentResult: unknown = payload;
    const injected = new Map<
      string,
      { message: string; priority: number; tokenCost: number }
    >();
    const overrides: AgentDecision[] = [];
    let blockReason: string | undefined;

    for (const handler of this.#handlers) {
      try {
        const signal = await handler.handle({ type, payload: currentPayload });
        records.push({ handlerId: handler.id, signal });

        switch (signal.kind) {
          case "none":
            break;
          case "block":
            blockReason = signal.reason;
            return finishResult(
              currentPayload,
              injected,
              overrides,
              records,
              this.#tokenBudget,
              {
                blocked: true,
                blockReason,
              },
            );
          case "modifyArgs":
            currentPayload = signal.args as TPayload;
            currentResult = currentPayload;
            break;
          case "modifyResult":
            currentResult = signal.result;
            break;
          case "overrideDecision":
            if (!signal.privileged && !handler.privileged) {
              blockReason =
                `Unprivileged handler attempted overrideDecision: ${handler.id}`;
              return finishResult(
                currentPayload,
                injected,
                overrides,
                records,
                this.#tokenBudget,
                { blocked: true, blockReason },
              );
            }
            overrides.push(signal.decision);
            break;
          case "injectMessage":
            injected.set(signal.message, {
              message: signal.message,
              priority: signal.priority,
              tokenCost: signal.tokenCost ?? estimateTokenCost(signal.message),
            });
            break;
        }
      } catch (error) {
        const kernelError = toKernelError(error);
        records.push({
          handlerId: handler.id,
          signal: { kind: "none" },
          error: kernelError,
        });

        if (this.#blockOnHandlerError) {
          return finishResult(
            currentPayload,
            injected,
            overrides,
            records,
            this.#tokenBudget,
            { blocked: true, blockReason: kernelError.message },
          );
        }
      }
    }

    return finishResult(
      currentResult as TPayload,
      injected,
      overrides,
      records,
      this.#tokenBudget,
      { blocked: false },
    );
  }
}

function finishResult<TPayload>(
  payload: TPayload,
  injected: Map<string, { message: string; priority: number; tokenCost: number }>,
  overrides: AgentDecision[],
  records: EventEngineRecord[],
  tokenBudget: number,
  state: { blocked: boolean; blockReason?: string },
): EventEngineResult<TPayload> {
  if (overrides.length > 1) {
    return {
      blocked: true,
      blockReason: "Conflicting overrideDecision signals.",
      payload,
      injectedMessages: [],
      records,
    };
  }

  return {
    blocked: state.blocked,
    blockReason: state.blockReason,
    payload,
    injectedMessages: mergeInjectedMessages([...injected.values()], tokenBudget),
    overrideDecision: overrides[0],
    records,
  };
}

function mergeInjectedMessages(
  messages: Array<{ message: string; priority: number; tokenCost: number }>,
  tokenBudget: number,
): string[] {
  const sorted = messages.sort((a, b) => b.priority - a.priority);
  const selected: string[] = [];
  let spent = 0;

  for (const item of sorted) {
    if (spent + item.tokenCost > tokenBudget) {
      continue;
    }
    selected.push(item.message);
    spent += item.tokenCost;
  }

  return selected;
}

function estimateTokenCost(message: string): number {
  return Math.max(1, Math.ceil(message.length / 4));
}

function toKernelError(error: unknown): KernelError {
  return {
    code: "event_handler_failed",
    message: error instanceof Error ? error.message : String(error),
  };
}
