import type { H3Event } from "h3";
import {
  getRequestHeaders,
  getRequestIP,
  getRequestURL,
  getRequestWebStream,
} from "h3";

export const WEB_REQUEST_BODY_LIMIT = 64 * 1024;

const oversizedRequests = new WeakSet<Request>();
const trustedClientIds = new WeakMap<Request, string>();

export const createWebRequest = async (
  event: H3Event,
  method?: string,
): Promise<Request> => {
  const source = event.web?.request;
  const nextMethod = method ?? event.method;
  const headers = source?.headers ?? new Headers(
    Object.entries(getRequestHeaders(event)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const url = source?.url ?? getRequestURL(event).toString();
  const clientId = trustedClientId(event, headers);

  if (nextMethod === "GET" || nextMethod === "HEAD") {
    const request = new Request(url, { method: nextMethod, headers });
    trustedClientIds.set(request, clientId);
    return request;
  }

  const stream = source?.body ?? getRequestWebStream(event);
  const declaredLength = Number(headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > WEB_REQUEST_BODY_LIMIT) {
    await stream?.cancel("request body too large").catch(() => undefined);
    return oversizedRequest(url, nextMethod, headers, clientId);
  }

  const body = await readBoundedBody(stream, WEB_REQUEST_BODY_LIMIT);
  if (body === null) return oversizedRequest(url, nextMethod, headers, clientId);
  const request = new Request(url, {
    method: nextMethod,
    headers,
    body: body.length === 0 ? undefined : body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer,
  });
  trustedClientIds.set(request, clientId);
  return request;
};

export const isRequestBodyTooLarge = (req: Request): boolean =>
  oversizedRequests.has(req);

export const getTrustedClientIdentity = (req: Request): string =>
  trustedClientIds.get(req) ?? normalizeClientId(req.headers.get("cf-connecting-ip")) ??
    "unknown";

const readBoundedBody = async (
  stream: ReadableStream<Uint8Array> | null | undefined,
  limit: number,
): Promise<Uint8Array | null> => {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel("request body too large").catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

const oversizedRequest = (
  url: string,
  method: string,
  headers: Headers,
  clientId: string,
): Request => {
  const request = new Request(url, { method, headers });
  oversizedRequests.add(request);
  trustedClientIds.set(request, clientId);
  return request;
};

const trustedClientId = (event: H3Event, headers: Headers): string =>
  normalizeClientId(event.context.clientAddress) ??
    normalizeClientId(headers.get("cf-connecting-ip")) ??
    normalizeClientId(getRequestIP(event)) ?? "unknown";

const normalizeClientId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized.length === 0 || normalized.length > 64 ||
    !/^[0-9a-f:.]+$/.test(normalized)
  ) return null;
  return normalized;
};
