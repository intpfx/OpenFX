import { TELEMETRY_AGGREGATE_MS, TELEMETRY_RETENTION_MS } from "./constants.ts";
import type { TelemetryMinute, TelemetrySample } from "./types.ts";

export function aggregateTelemetrySamples(
  samples: readonly TelemetrySample[],
): TelemetryMinute[] {
  const buckets = new Map<number, TelemetrySample[]>();
  for (const sample of samples) {
    const minuteStart = Math.floor(sample.collectedAt / TELEMETRY_AGGREGATE_MS) *
      TELEMETRY_AGGREGATE_MS;
    const bucket = buckets.get(minuteStart) ?? [];
    bucket.push(sample);
    buckets.set(minuteStart, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left - right)
    .map(([minuteStart, bucket]) => aggregateMinute(minuteStart, bucket));
}

export function retainTelemetryMinutes(
  minutes: readonly TelemetryMinute[],
  now: number,
): TelemetryMinute[] {
  const cutoff = now - TELEMETRY_RETENTION_MS;
  return minutes.filter((minute) => minute.minuteStart >= cutoff);
}

function aggregateMinute(
  minuteStart: number,
  unsortedSamples: readonly TelemetrySample[],
): TelemetryMinute {
  const samples = [...unsortedSamples].sort((left, right) =>
    left.collectedAt - right.collectedAt
  );
  const first = samples[0]!;
  const last = samples.at(-1)!;
  const batteries = samples
    .map((sample) => sample.batteryPercent)
    .filter((value): value is number => value !== null);

  return {
    minuteStart,
    sampleCount: samples.length,
    cpuUsagePercent: average(samples.map((sample) => sample.cpuUsagePercent)),
    memoryUsedBytes: average(samples.map((sample) => sample.memoryUsedBytes)),
    memoryTotalBytes: last.memoryTotalBytes,
    diskUsedBytes: average(samples.map((sample) => sample.diskUsedBytes)),
    diskTotalBytes: last.diskTotalBytes,
    networkRxBytes: Math.max(0, last.networkRxBytes - first.networkRxBytes),
    networkTxBytes: Math.max(0, last.networkTxBytes - first.networkTxBytes),
    batteryPercent: batteries.length === 0 ? null : average(batteries),
    processCount: average(samples.map((sample) => sample.processCount)),
  };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
