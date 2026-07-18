import {
  aggregateTelemetrySamples,
  retainTelemetryMinutes,
} from "../../../../domains/_shared/openfx-node/telemetry.ts";
import type {
  TelemetryMinute,
  TelemetrySample,
} from "../../../../domains/_shared/openfx-node/types.ts";
import type { DesktopPreferences } from "./types.ts";

export const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = Object.freeze({
  serverUrl: "",
  nodeId: "",
  nodeName: "OpenFX Mac",
  relayEnabled: true,
  pairedAt: null,
});

export const sanitizeDesktopPreferences = (
  candidate: Record<string, unknown>,
): DesktopPreferences => {
  let serverUrl = "";
  if (typeof candidate.serverUrl === "string" && candidate.serverUrl.trim()) {
    try {
      const url = new URL(candidate.serverUrl.trim());
      if (url.protocol === "https:") serverUrl = url.origin;
    } catch {
      serverUrl = "";
    }
  }
  return {
    serverUrl,
    nodeId: stringValue(candidate.nodeId),
    nodeName: stringValue(candidate.nodeName) ||
      DEFAULT_DESKTOP_PREFERENCES.nodeName,
    relayEnabled: typeof candidate.relayEnabled === "boolean"
      ? candidate.relayEnabled
      : DEFAULT_DESKTOP_PREFERENCES.relayEnabled,
    pairedAt: typeof candidate.pairedAt === "number" &&
        Number.isSafeInteger(candidate.pairedAt) && candidate.pairedAt >= 0
      ? candidate.pairedAt
      : null,
  };
};

export interface TelemetryAccumulator {
  add(sample: TelemetrySample): void;
  samples(): readonly TelemetrySample[];
  minutes(now?: number): TelemetryMinute[];
}

export const createTelemetryAccumulator = (): TelemetryAccumulator => {
  const samples: TelemetrySample[] = [];
  return {
    add(sample) {
      samples.push({ ...sample });
      if (samples.length > 12 * 60 * 24 * 7) samples.shift();
    },
    samples: () => samples.map((sample) => ({ ...sample })),
    minutes(now) {
      const minutes = aggregateTelemetrySamples(samples);
      return now === undefined ? minutes : retainTelemetryMinutes(minutes, now);
    },
  };
};

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
