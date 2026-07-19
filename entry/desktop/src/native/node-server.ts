import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Buffer } from "node:buffer";

import {
  OPENFX_NODE_ERROR_CODES,
  OpenFxNodeProtocolError,
} from "../../../../domains/_shared/openfx-node/mod.ts";
import type { NodeCryptoAdapter } from "../../../../domains/_shared/openfx-node/crypto.ts";
import type { SealedRelayEnvelope } from "../../../../domains/_shared/openfx-node/types.ts";
import type { SignableNodeRequest } from "../../../../domains/_shared/openfx-node/request-signing.ts";
import { createNodeRelayProtocol, PUBLIC_NODE_HEALTH } from "../core/node-protocol.ts";
import type { PersistentReplayStore } from "../core/node-protocol.ts";

const MAX_REQUEST_BYTES = 64 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export interface NodeServerOptions {
  crypto: NodeCryptoAdapter;
  loadSecret(): Promise<Uint8Array | null>;
  dispatch(request: SignableNodeRequest, signal?: AbortSignal): Promise<unknown>;
  host?: string;
  port?: number;
  replayStore?: PersistentReplayStore;
  requestTimeoutMs?: number;
  headersTimeoutMs?: number;
  keepAliveTimeoutMs?: number;
}

export interface RunningNodeServer {
  readonly host: string;
  readonly port: number;
  close(): Promise<void>;
}

export const startNodeServer = (
  options: NodeServerOptions,
): Promise<RunningNodeServer> => {
  const host = options.host ?? "::";
  const port = options.port ?? 24_531;
  let protocolKey = "";
  let protocol: ReturnType<typeof createNodeRelayProtocol> | null = null;
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      if (request.aborted || response.destroyed) return;
      if (response.headersSent) {
        response.destroy(
          error instanceof Error ? error : new Error(String(error)),
        );
        return;
      }
      const code = error instanceof NodeHttpError
        ? error.code
        : error instanceof OpenFxNodeProtocolError
        ? error.code
        : OPENFX_NODE_ERROR_CODES.internal;
      const status = error instanceof NodeHttpError
        ? error.status
        : protocolStatus(code);
      request.resume();
      json(response, status, { ok: false, error: code });
    });
  });

  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const path = (request.url ?? "").split("?", 1)[0];
    if (request.method === "GET" && path === "/v1/health") {
      json(response, 200, PUBLIC_NODE_HEALTH);
      return;
    }
    if (request.method !== "POST" || path !== "/v1/relay") {
      json(response, 404, {
        ok: false,
        error: OPENFX_NODE_ERROR_CODES.routeNotAllowed,
      });
      return;
    }
    const abortController = new AbortController();
    const abortDispatch = (): void => abortController.abort();
    const abortClosedResponse = (): void => {
      if (!response.writableEnded) abortDispatch();
    };
    request.once("aborted", abortDispatch);
    response.once("close", abortClosedResponse);
    try {
      const secret = await options.loadSecret();
      if (!secret) {
        json(response, 503, {
          ok: false,
          error: OPENFX_NODE_ERROR_CODES.nodeUnpaired,
        });
        return;
      }
      const nextKey = Buffer.from(secret).toString("base64");
      if (!protocol || nextKey !== protocolKey) {
        protocolKey = nextKey;
        protocol = createNodeRelayProtocol({
          crypto: options.crypto,
          secret,
          dispatch: options.dispatch,
          replayStore: options.replayStore,
        });
      }
      const envelope = await readJson(
        request,
        options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      ) as SealedRelayEnvelope;
      const reply = await protocol.handle(envelope, abortController.signal);
      json(
        response,
        200,
        reply,
      );
    } finally {
      request.removeListener("aborted", abortDispatch);
      response.removeListener("close", abortClosedResponse);
    }
  };

  server.requestTimeout = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  server.headersTimeout = options.headersTimeoutMs ?? 5_000;
  server.keepAliveTimeout = options.keepAliveTimeoutMs ?? 5_000;
  server.maxHeadersCount = 64;

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        host,
        port: actualPort,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => error ? closeReject(error) : closeResolve());
          }),
      });
    });
  });
};

class NodeHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const readJson = (
  request: IncomingMessage,
  timeoutMs: number,
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let length = 0;
    let settled = false;
    const finish = (operation: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      operation();
    };
    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new NodeHttpError(
            408,
            OPENFX_NODE_ERROR_CODES.invalidRequest,
            "Node request timed out.",
          ),
        )
      );
    }, timeoutMs);
    request.on("data", (chunk: Uint8Array) => {
      if (settled) return;
      length += chunk.length;
      if (length > MAX_REQUEST_BYTES) {
        finish(() =>
          reject(
            new NodeHttpError(
              413,
              OPENFX_NODE_ERROR_CODES.invalidRequest,
              "Node request exceeded 64 KiB.",
            ),
          )
        );
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      try {
        finish(() => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
      } catch {
        finish(() =>
          reject(
            new OpenFxNodeProtocolError(
              OPENFX_NODE_ERROR_CODES.invalidRequest,
              "Node request body is not valid JSON.",
            ),
          )
        );
      }
    });
    request.on("error", (error) => finish(() => reject(error)));
    request.on(
      "aborted",
      () => finish(() => reject(new Error("relay_client_aborted"))),
    );
  });

const json = (
  response: ServerResponse,
  status: number,
  body: unknown,
): void => {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(payload)),
    "cache-control": "no-store",
  });
  response.end(payload);
};

const protocolStatus = (code: string): number => {
  switch (code) {
    case OPENFX_NODE_ERROR_CODES.replayDetected:
      return 409;
    case OPENFX_NODE_ERROR_CODES.routeNotAllowed:
      return 404;
    case OPENFX_NODE_ERROR_CODES.timestampInvalid:
    case OPENFX_NODE_ERROR_CODES.signatureInvalid:
    case OPENFX_NODE_ERROR_CODES.envelopeInvalid:
    case OPENFX_NODE_ERROR_CODES.protocolMismatch:
    case OPENFX_NODE_ERROR_CODES.invalidRequest:
      return 400;
    default:
      return 500;
  }
};
