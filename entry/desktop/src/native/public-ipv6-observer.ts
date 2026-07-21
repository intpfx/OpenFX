import { TELEMETRY_AGGREGATE_MS } from "../../../../domains/_shared/openfx-node/constants.ts";
import { isPublicIpv6 } from "../core/system-parsers.ts";
import type { ParsedSystemState } from "../core/types.ts";
import type { SystemCollector } from "./system-monitor.ts";
import type { HttpJsonRequest, JsonRequester } from "./omlx-client.ts";

export const PUBLIC_IPV6_OBSERVATION_ENDPOINTS: readonly HttpJsonRequest[] = Object
  .freeze([
    {
      protocol: "https:",
      hostname: "api6.ipify.org",
      port: 443,
      path: "/?format=json",
      method: "GET",
    },
    {
      protocol: "https:",
      hostname: "api64.ipify.org",
      port: 443,
      path: "/?format=json",
      method: "GET",
    },
  ]);

export interface PublicIpv6Observation {
  publicIpv6: string | null;
  observedIpv6: string[];
  mismatch: boolean;
  observationErrors: string[];
}

export interface PublicIpv6Observer {
  observe(
    localCandidates: readonly string[],
  ): PublicIpv6Observation | Promise<PublicIpv6Observation>;
}

export interface PublicIpv6ObserverOptions {
  now?: () => number;
  refreshIntervalMs?: number;
}

interface ExternalIpv6Observation {
  observedAt: number;
  observedIpv6: string[];
  observationErrors: string[];
}

export const createPublicIpv6Observer = (
  requestJson: JsonRequester,
  options: PublicIpv6ObserverOptions = {},
): PublicIpv6Observer => {
  const now = options.now ?? Date.now;
  const refreshIntervalMs = options.refreshIntervalMs ?? TELEMETRY_AGGREGATE_MS;
  let cached: ExternalIpv6Observation | null = null;
  let inFlight: Promise<ExternalIpv6Observation> | null = null;

  const refresh = async (): Promise<ExternalIpv6Observation> => {
    const responses = await Promise.allSettled(
      PUBLIC_IPV6_OBSERVATION_ENDPOINTS.map((request) => requestJson(request)),
    );
    const observedIpv6: string[] = [];
    const observationErrors: string[] = [];
    for (let index = 0; index < responses.length; index += 1) {
      const response = responses[index]!;
      const endpoint = PUBLIC_IPV6_OBSERVATION_ENDPOINTS[index]!;
      if (response.status === "rejected") {
        observationErrors.push(
          `${endpoint.hostname}: ${errorMessage(response.reason)}`,
        );
        continue;
      }
      const body = objectValue(response.value.body);
      const value = typeof body.ip === "string" ? body.ip.trim().toLowerCase() : "";
      if (response.value.status !== 200 || !isPublicIpv6(value)) {
        observationErrors.push(`${endpoint.hostname}: invalid observation`);
        continue;
      }
      if (!observedIpv6.includes(value)) observedIpv6.push(value);
    }
    const observation = {
      observedAt: now(),
      observedIpv6,
      observationErrors,
    };
    cached = observation;
    return observation;
  };

  const externalObservation = ():
    | ExternalIpv6Observation
    | Promise<ExternalIpv6Observation> => {
    const current = now();
    if (cached && current - cached.observedAt < refreshIntervalMs) return cached;
    const pending = inFlight ?? refresh();
    inFlight = pending;
    return pending.finally(() => {
      if (inFlight === pending) inFlight = null;
    });
  };

  return {
    observe(localCandidates) {
      const external = externalObservation();
      return isPromiseLike<ExternalIpv6Observation>(external)
        ? external.then((observation) => mergeObservation(localCandidates, observation))
        : mergeObservation(localCandidates, external);
    },
  };
};

export const createObservedSystemCollector = (
  collector: SystemCollector,
  observer: PublicIpv6Observer,
): SystemCollector => ({
  collect(callback) {
    collector.collect((error, state) => {
      if (error || !state) {
        callback(error ?? new Error("system_collection_empty"), null);
        return;
      }
      try {
        const observed = observer.observe(state.network.ipv6Addresses);
        if (isPromiseLike<PublicIpv6Observation>(observed)) {
          observed.then(
            (observation) => callback(null, withObservation(state, observation)),
            (observationError) => callback(observationError, null),
          );
        } else callback(null, withObservation(state, observed));
      } catch (observationError) {
        callback(observationError, null);
      }
    });
  },
});

const mergeObservation = (
  localCandidates: readonly string[],
  observation: ExternalIpv6Observation,
): PublicIpv6Observation => {
  const local = localCandidates.map((value) => value.toLowerCase())
    .filter(isPublicIpv6);
  const publicIpv6 =
    local.find((candidate) => observation.observedIpv6.includes(candidate)) ?? null;
  return {
    publicIpv6,
    observedIpv6: observation.observedIpv6,
    mismatch: observation.observedIpv6.length > 0 && publicIpv6 === null,
    observationErrors: observation.observationErrors,
  };
};

const withObservation = (
  state: ParsedSystemState,
  observation: PublicIpv6Observation,
): ParsedSystemState => ({
  ...state,
  network: { ...state.network, ...observation },
});

const isPromiseLike = <Value>(value: unknown): value is PromiseLike<Value> =>
  value !== null && typeof value === "object" &&
  typeof (value as { then?: unknown }).then === "function";

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
