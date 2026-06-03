import type { EAgentRuntimeStep } from "../app/e-agent-runtime.ts";
import type { BoundaryRequest, QueuedMessage } from "../core/types.ts";
import type { ProgressEvent, ProgressEventType } from "./progress-event.ts";

export interface RuntimeEventBridgeOptions {
  now?: () => number;
  createId?: () => string;
}

export class RuntimeEventBridge {
  readonly #events: ProgressEvent[] = [];
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: RuntimeEventBridgeOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? crypto.randomUUID;
  }

  emit(type: ProgressEventType, payload?: ProgressEvent["payload"]): ProgressEvent {
    const event: ProgressEvent = {
      id: this.#createId(),
      type,
      at: this.#now(),
      payload,
    };
    this.#events.push(event);
    return event;
  }

  emitQueued(message: QueuedMessage): ProgressEvent {
    return this.emit("runtime:queued", { queuedMessage: message });
  }

  emitStep(step: EAgentRuntimeStep): ProgressEvent[] {
    const events = [
      this.emit("runtime:step_started", { queuedMessage: step.queuedMessage }),
      this.emit("runtime:step_completed", { turnRecord: step.turn.record }),
    ];

    for (const request of step.turn.record.boundaryRequests) {
      if (request.state === "pending") {
        events.push(this.emitBoundaryRequired(request));
      }
    }

    return events;
  }

  emitBoundaryRequired(request: BoundaryRequest): ProgressEvent {
    return this.emit("boundary:required", { boundaryRequest: request });
  }

  list(): ProgressEvent[] {
    return [...this.#events];
  }

  clear(): void {
    this.#events.length = 0;
  }
}
