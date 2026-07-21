import type {
  TelemetryMinute,
  TelemetrySample,
} from "../../../../domains/_shared/openfx-node/types.ts";
import { createTelemetryAccumulator } from "../core/desktop-state.ts";
import type {
  NetworkStatus,
  ParsedSystemState,
  ProcessInfo,
  SystemOverview,
} from "../core/types.ts";

export interface SystemCollector {
  collect(
    callback: (error: unknown | null, state: ParsedSystemState | null) => void,
  ): void;
}

export interface SystemMonitorOptions {
  collector: SystemCollector;
  onSample?(state: ParsedSystemState): Promise<void> | void;
  onError?(error: unknown): Promise<void> | void;
}

export interface SystemMonitor {
  start(): void;
  stop(): void;
  sampleNow(): Promise<ParsedSystemState | null>;
  overview(): SystemOverview | null;
  processes(): ProcessInfo[];
  network(): NetworkStatus | null;
  minutes(): TelemetryMinute[];
}

export const createSystemMonitor = (
  options: SystemMonitorOptions,
): SystemMonitor => {
  const telemetry = createTelemetryAccumulator();
  let latest: ParsedSystemState | null = null;
  let started = false;
  let collecting = false;

  const finishError = (
    error: unknown,
    done: (state: ParsedSystemState | null) => void,
  ): void => {
    const finish = () => {
      collecting = false;
      done(latest);
    };
    try {
      const hook = options.onError?.(error);
      if (isPromiseLike(hook)) hook.then(finish, finish);
      else finish();
    } catch {
      finish();
    }
  };

  const sample = (
    done: (state: ParsedSystemState | null) => void = () => {},
  ): void => {
    if (collecting) {
      done(latest);
      return;
    }
    collecting = true;
    options.collector.collect((error, state) => {
      if (error || !state) {
        finishError(error ?? new Error("system_collection_empty"), done);
        return;
      }
      latest = state;
      telemetry.add(toSample(state.overview));
      const finish = () => {
        collecting = false;
        done(state);
      };
      try {
        const hook = options.onSample?.(state);
        if (isPromiseLike(hook)) {
          hook.then(finish, (hookError) => finishError(hookError, done));
        } else finish();
      } catch (hookError) {
        finishError(hookError, done);
      }
    });
  };

  const monitor: SystemMonitor = {
    start() {
      if (started) return;
      started = true;
      sample();
    },
    stop() {
      started = false;
    },
    sampleNow: () => new Promise((resolve) => sample(resolve)),
    overview: () => latest?.overview ?? null,
    processes: () => latest?.processes.slice() ?? [],
    network: () => latest?.network ?? null,
    minutes: () => telemetry.minutes(),
  };
  return monitor;
};

const isPromiseLike = (value: unknown): value is PromiseLike<void> =>
  value !== null && typeof value === "object" &&
  typeof (value as { then?: unknown }).then === "function";

const toSample = (overview: SystemOverview): TelemetrySample => ({
  collectedAt: overview.collectedAt,
  cpuUsagePercent: overview.cpuUsagePercent,
  memoryUsedBytes: overview.memoryUsedBytes,
  memoryTotalBytes: overview.memoryTotalBytes,
  diskUsedBytes: overview.diskUsedBytes,
  diskTotalBytes: overview.diskTotalBytes,
  networkRxBytes: overview.networkRxBytes,
  networkTxBytes: overview.networkTxBytes,
  batteryPercent: overview.batteryPercent,
  processCount: overview.processCount,
});
