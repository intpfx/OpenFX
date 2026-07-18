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

const MAX_REQUEST_BYTES = 64 * 1024;

export interface NodeServerOptions {
  crypto: NodeCryptoAdapter;
  loadSecret(): Promise<Uint8Array | null>;
  dispatch(request: SignableNodeRequest): Promise<unknown>;
  host?: string;
  port?: number;
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
      if (response.headersSent) {
        response.destroy(
          error instanceof Error ? error : new Error(String(error)),
        );
        return;
      }
      const code = error instanceof OpenFxNodeProtocolError
        ? error.code
        : OPENFX_NODE_ERROR_CODES.internal;
      json(response, protocolStatus(code), { ok: false, error: code });
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
      });
    }
    const envelope = await readJson(request) as SealedRelayEnvelope;
    json(response, 200, await protocol.handle(envelope));
  };

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

const readJson = (request: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let length = 0;
    request.on("data", (chunk: Uint8Array) => {
      length += chunk.length;
      if (length > MAX_REQUEST_BYTES) {
        reject(
          new OpenFxNodeProtocolError(
            OPENFX_NODE_ERROR_CODES.invalidRequest,
            "Node request exceeded 64 KiB.",
          ),
        );
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(
          new OpenFxNodeProtocolError(
            OPENFX_NODE_ERROR_CODES.invalidRequest,
            "Node request body is not valid JSON.",
          ),
        );
      }
    });
    request.on("error", reject);
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
