export const DENO_REQUEST_BODY_LIMIT = 64 * 1024;
export const TRUSTED_REMOTE_ADDRESS_HEADER = "x-openfx-trusted-remote-address";
export const BOUNDED_DENO_ENTRY_MARKER = "openfx-bounded-deno-entry-v1";

export interface DenoRequestInfo {
  remoteAddr: { hostname: string };
}

export interface NitroLocalFetchInit extends RequestInit {
  host: string;
  protocol: string;
}

export interface DenoWebSocketAdapter {
  handleUpgrade(request: Request, info: DenoRequestInfo): Response;
}

export interface DenoRequestHandlerOptions {
  localFetch(
    path: string,
    init: NitroLocalFetchInit,
  ): Response | Promise<Response>;
  websocket?: DenoWebSocketAdapter;
}

export const readBoundedRequestBody = async (
  stream: ReadableStream<Uint8Array> | null,
  limit = DENO_REQUEST_BODY_LIMIT,
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

export const createDenoRequestHandler = (
  options: DenoRequestHandlerOptions,
) => {
  return async (request: Request, info: DenoRequestInfo): Promise<Response> => {
    if (
      options.websocket &&
      request.headers.get("upgrade")?.toLowerCase() === "websocket"
    ) {
      return options.websocket.handleUpgrade(request, info);
    }

    const url = new URL(request.url);
    const headers = trustedHeaders(request.headers, info.remoteAddr.hostname, url);
    const declaredLength = Number(headers.get("content-length") ?? "0");
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > DENO_REQUEST_BODY_LIMIT
    ) {
      await request.body?.cancel("request body too large").catch(() => undefined);
      return bodyTooLargeResponse();
    }
    const body = await readBoundedRequestBody(request.body);
    if (body === null) return bodyTooLargeResponse();

    return await options.localFetch(url.pathname + url.search, {
      host: url.hostname,
      protocol: url.protocol,
      headers,
      method: request.method,
      redirect: request.redirect,
      body: body.byteLength === 0 ? undefined : body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength,
      ) as ArrayBuffer,
    });
  };
};

const trustedHeaders = (
  source: Headers,
  remoteAddress: string,
  url: URL,
): Headers => {
  const headers = new Headers(source);
  headers.delete(TRUSTED_REMOTE_ADDRESS_HEADER);
  headers.delete("cf-connecting-ip");
  headers.delete("x-forwarded-for");
  headers.set(TRUSTED_REMOTE_ADDRESS_HEADER, remoteAddress);
  headers.set("x-forwarded-for", remoteAddress);
  headers.set("x-forwarded-proto", url.protocol.replace(/:$/, ""));
  return headers;
};

const bodyTooLargeResponse = (): Response =>
  Response.json(
    { ok: false, error: "request_too_large" },
    {
      status: 413,
      headers: { "x-openfx-runtime": BOUNDED_DENO_ENTRY_MARKER },
    },
  );
