import {
  NODE_PORT,
  OPENFX_NODE_ERROR_CODES,
  PROTOCOL_VERSION,
  type TelemetrySample,
} from "../../../../domains/_shared/openfx-node/mod.ts";
import { isRequestBodyTooLarge } from "../utils/request.ts";
import type { ConsoleEventType } from "./event-service.ts";

const REQUEST_LIMIT_BYTES = 64 * 1024;

export const readJsonObject = async (
  req: Request,
): Promise<Record<string, unknown> | Response> => {
  if (isRequestBodyTooLarge(req)) return invalidRequest(413);
  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > REQUEST_LIMIT_BYTES) {
    return invalidRequest(413);
  }
  let text: string;
  try {
    text = await req.text();
  } catch {
    return invalidRequest(400);
  }
  if (new TextEncoder().encode(text).length > REQUEST_LIMIT_BYTES) {
    return invalidRequest(413);
  }
  try {
    const value = text ? JSON.parse(text) : {};
    return value !== null && !Array.isArray(value) && typeof value === "object"
      ? value as Record<string, unknown>
      : invalidRequest(400);
  } catch {
    return invalidRequest(400);
  }
};

export const validateNodeEndpoint = (
  input: Record<string, unknown>,
): Response | null => {
  if (input.protocolVersion !== PROTOCOL_VERSION) {
    return Response.json(
      { ok: false, error: OPENFX_NODE_ERROR_CODES.protocolMismatch },
      { status: 400 },
    );
  }
  if (
    typeof input.name !== "string" && input.nodeId === undefined ||
    (typeof input.name === "string" &&
      (input.name.trim().length === 0 || input.name.length > 128)) ||
    typeof input.publicIpv6 !== "string" || !isGlobalIpv6(input.publicIpv6) ||
    input.port !== NODE_PORT
  ) return invalidRequest(400);
  return null;
};

export const isGlobalIpv6 = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (!normalized.includes(":") || !/^[0-9a-f:]+$/.test(normalized)) return false;
  try {
    new URL(`http://[${normalized}]/`);
  } catch {
    return false;
  }
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("ff")) {
    return false;
  }
  const first = Number.parseInt(normalized.split(":", 1)[0] || "0", 16);
  if (!Number.isFinite(first)) return false;
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return false;
  return first >= 0x2000 && first <= 0x3fff;
};

export const isAllowedRelayBody = (
  operation: string,
  method: string,
  body: unknown,
): boolean => {
  if (method === "GET") return body === null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  const exactKeys = (allowed: readonly string[]) =>
    Object.keys(record).every((key) => allowed.includes(key));
  switch (operation) {
    case "agent.messages.post":
      return exactKeys(["message", "conversationId"]) &&
        typeof record.message === "string" && record.message.length > 0 &&
        record.message.length <= 16_384;
    case "approvals.resolve":
      return exactKeys(["id", "decision", "parameterFingerprint"]) &&
        typeof record.id === "string" &&
        (record.decision === "approved" || record.decision === "rejected") &&
        typeof record.parameterFingerprint === "string";
    case "relay.settings.update":
      return exactKeys(["enabled"]) && typeof record.enabled === "boolean";
    default:
      return false;
  }
};

export const parseTelemetrySample = (value: unknown): TelemetrySample | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sample = value as Record<string, unknown>;
  const finiteNonNegative = (key: string) =>
    typeof sample[key] === "number" && Number.isFinite(sample[key]) &&
    (sample[key] as number) >= 0;
  const keys = [
    "collectedAt",
    "cpuUsagePercent",
    "memoryUsedBytes",
    "memoryTotalBytes",
    "diskUsedBytes",
    "diskTotalBytes",
    "networkRxBytes",
    "networkTxBytes",
    "processCount",
  ];
  if (!keys.every(finiteNonNegative)) return null;
  if ((sample.cpuUsagePercent as number) > 100) return null;
  if (
    sample.batteryPercent !== null &&
    (!finiteNonNegative("batteryPercent") || (sample.batteryPercent as number) > 100)
  ) return null;
  return sample as unknown as TelemetrySample;
};

export const parseNodeEvent = (
  value: unknown,
): { type: ConsoleEventType; data: unknown } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) {
    return null;
  }
  const data = event.data as Record<string, unknown>;
  switch (event.type) {
    case "agent.delta":
      return typeof data.messageId === "string" &&
          typeof data.delta === "string" && data.delta.length > 0 &&
          data.delta.length <= 16_384 && Number.isSafeInteger(data.sequence)
        ? { type: event.type, data }
        : null;
    case "approval.requested":
      return typeof data.id === "string" && typeof data.summary === "string"
        ? { type: event.type, data }
        : null;
    case "approval.resolved":
      return typeof data.id === "string" &&
          (data.decision === "approved" || data.decision === "rejected")
        ? { type: event.type, data }
        : null;
    default:
      return null;
  }
};

const invalidRequest = (status: number): Response =>
  Response.json(
    { ok: false, error: OPENFX_NODE_ERROR_CODES.invalidRequest },
    { status },
  );
