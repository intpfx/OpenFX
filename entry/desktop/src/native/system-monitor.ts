import { TELEMETRY_SAMPLE_MS } from "../../../../domains/_shared/openfx-node/constants.ts";
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
  collect(): Promise<ParsedSystemState>;
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
  let timer: ReturnType<typeof setInterval> | null = null;
  let collecting = false;
  const monitor: SystemMonitor = {
    start() {
      if (timer !== null) return;
      void monitor.sampleNow();
      timer = setInterval(() => void monitor.sampleNow(), TELEMETRY_SAMPLE_MS);
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    async sampleNow() {
      if (collecting) return latest;
      collecting = true;
      try {
        const state = await options.collector.collect();
        latest = state;
        telemetry.add(toSample(state.overview));
        await options.onSample?.(state);
        return state;
      } catch (error) {
        await options.onError?.(error);
        return latest;
      } finally {
        collecting = false;
      }
    },
    overview: () => latest?.overview ?? null,
    processes: () => latest?.processes.slice() ?? [],
    network: () => latest?.network ?? null,
    minutes: () => telemetry.minutes(),
  };
  return monitor;
};

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
