import type { EAgentRuntime, EAgentRuntimeStep } from "../app/e-agent-runtime.ts";
import type { ForegroundControlSignal, ProgressEvent } from "./progress-event.ts";
import { RuntimeEventBridge } from "./runtime-event-bridge.ts";

export interface ForegroundSessionControllerOptions {
  runtime: EAgentRuntime;
  bridge?: RuntimeEventBridge;
}

export class ForegroundSessionController {
  readonly runtime: EAgentRuntime;
  readonly bridge: RuntimeEventBridge;
  #interrupted = false;

  constructor(options: ForegroundSessionControllerOptions) {
    this.runtime = options.runtime;
    this.bridge = options.bridge ?? new RuntimeEventBridge();
    this.bridge.emit("foreground:started");
  }

  async submitUserMessage(content: string): Promise<ProgressEvent[]> {
    this.bridge.emit("foreground:user_message", { message: content });
    const queued = await this.runtime.enqueueUserMessage(content);
    this.bridge.emitQueued(queued);
    return this.bridge.list();
  }

  async runBackgroundUntilIdle(limit = 8): Promise<EAgentRuntimeStep[]> {
    const steps: EAgentRuntimeStep[] = [];

    for (let index = 0; index < limit; index++) {
      if (this.#interrupted) {
        this.bridge.emit("runtime:interrupted");
        return steps;
      }

      const step = await this.runtime.processNext();
      if (!step) {
        this.bridge.emit("runtime:idle");
        return steps;
      }

      steps.push(step);
      this.bridge.emitStep(step);
    }

    throw new Error(
      `ForegroundSessionController did not become idle within ${limit} steps.`,
    );
  }

  sendControl(signal: ForegroundControlSignal): ProgressEvent {
    switch (signal.kind) {
      case "interrupt":
        this.#interrupted = true;
        return this.bridge.emit("runtime:interrupted", { reason: signal.reason });
      case "approve":
        return this.bridge.emit("boundary:approved", {
          reason: signal.reason,
          boundaryRequest: signal.boundaryRequestId
            ? {
              id: signal.boundaryRequestId,
              reason: signal.reason ?? "approved",
              action: {
                id: signal.boundaryRequestId,
                kind: "workspace_change",
                title: "Approved boundary",
                target: signal.boundaryRequestId,
                state: "approved",
              },
              state: "approved",
              createdAt: Date.now(),
            }
            : undefined,
        });
      case "reject":
        return this.bridge.emit("boundary:rejected", { reason: signal.reason });
      case "pause":
        return this.bridge.emit("runtime:interrupted", {
          reason: signal.reason ?? "paused",
        });
      case "resume":
        this.#interrupted = false;
        return this.bridge.emit("foreground:started", {
          reason: signal.reason ?? "resumed",
        });
    }
  }

  progressEvents(): ProgressEvent[] {
    return this.bridge.list();
  }
}
