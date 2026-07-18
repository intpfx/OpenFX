import {
  OPENFX_NODE_ERROR_CODES,
  PROTOCOL_VERSION,
  RELAY_MAX_CLOCK_SKEW_MS,
} from "./constants.ts";
import { constantTimeEqual, type NodeCryptoAdapter } from "./crypto.ts";
import { canonicalJson, decodeBase64Url, encodeBase64Url, utf8 } from "./encoding.ts";
import { OpenFxNodeProtocolError } from "./errors.ts";
import type { ReplayProtector } from "./replay.ts";
import type { SignedNodeRequest } from "./types.ts";

export interface SignableNodeRequest {
  method: string;
  path: string;
  body: unknown;
}

export const SIGNED_NODE_REQUEST_HEADERS = {
  version: "x-openfx-node-version",
  timestamp: "x-openfx-node-timestamp",
  nonce: "x-openfx-node-nonce",
  bodyDigest: "x-openfx-node-content-sha256",
  signature: "x-openfx-node-signature",
} as const;

export interface HeaderReader {
  get(name: string): string | null;
}

export interface SignRequestOptions {
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
}

export interface VerifySignedRequestOptions {
  now?: () => number;
  replayProtector: ReplayProtector;
  maxClockSkewMs?: number;
}

export function signedRequestHeaders(
  request: SignedNodeRequest,
): Record<string, string> {
  return {
    [SIGNED_NODE_REQUEST_HEADERS.version]: String(request.version),
    [SIGNED_NODE_REQUEST_HEADERS.timestamp]: String(request.timestamp),
    [SIGNED_NODE_REQUEST_HEADERS.nonce]: request.nonce,
    [SIGNED_NODE_REQUEST_HEADERS.bodyDigest]: request.bodyDigest,
    [SIGNED_NODE_REQUEST_HEADERS.signature]: request.signature,
  };
}

export function signedRequestFromHeaders(
  headers: HeaderReader,
  request: SignableNodeRequest,
): SignedNodeRequest {
  const version = headers.get(SIGNED_NODE_REQUEST_HEADERS.version);
  if (version === null) {
    throw protocolError(
      OPENFX_NODE_ERROR_CODES.signatureInvalid,
      "Request signature headers are incomplete.",
    );
  }
  if (version !== String(PROTOCOL_VERSION)) {
    throw protocolError(
      OPENFX_NODE_ERROR_CODES.protocolMismatch,
      "Unsupported request version.",
    );
  }
  const timestampValue = headers.get(SIGNED_NODE_REQUEST_HEADERS.timestamp) ?? "";
  const timestamp = Number(timestampValue);
  if (!/^\d+$/.test(timestampValue) || !Number.isSafeInteger(timestamp)) {
    throw protocolError(
      OPENFX_NODE_ERROR_CODES.timestampInvalid,
      "Request timestamp is invalid.",
    );
  }
  const nonce = headers.get(SIGNED_NODE_REQUEST_HEADERS.nonce) ?? "";
  const bodyDigest = headers.get(SIGNED_NODE_REQUEST_HEADERS.bodyDigest) ?? "";
  const signature = headers.get(SIGNED_NODE_REQUEST_HEADERS.signature) ?? "";
  try {
    if (decodeBase64Url(nonce).length !== 16) throw new TypeError("invalid nonce");
  } catch {
    throw protocolError(
      OPENFX_NODE_ERROR_CODES.signatureInvalid,
      "Request nonce encoding is invalid.",
    );
  }
  if (!bodyDigest || !signature) {
    throw protocolError(
      OPENFX_NODE_ERROR_CODES.signatureInvalid,
      "Request signature headers are incomplete.",
    );
  }
  return {
    version: PROTOCOL_VERSION,
    method: request.method.toUpperCase(),
    path: request.path,
    body: request.body,
    bodyDigest,
    timestamp,
    nonce,
    signature,
  };
}

export async function signRequest(
  crypto: NodeCryptoAdapter,
  secret: Uint8Array,
  request: SignableNodeRequest,
  options: SignRequestOptions = {},
): Promise<SignedNodeRequest> {
  const timestamp = (options.now ?? Date.now)();
  const nonce = encodeBase64Url((options.randomBytes ?? crypto.randomBytes)(16));
  const signed = {
    version: PROTOCOL_VERSION,
    method: request.method.toUpperCase(),
    path: request.path,
    body: request.body,
    bodyDigest: encodeBase64Url(await crypto.sha256(utf8(canonicalJson(request.body)))),
    timestamp,
    nonce,
  } as const;
  return {
    ...signed,
    signature: encodeBase64Url(
      await crypto.hmacSha256(secret, utf8(canonicalJson(signed))),
    ),
  };
}

export async function verifySignedRequest(
  crypto: NodeCryptoAdapter,
  secret: Uint8Array,
  request: SignedNodeRequest,
  options: VerifySignedRequestOptions,
): Promise<true> {
  const now = (options.now ?? Date.now)();
  if (request.version !== PROTOCOL_VERSION) {
    throw protocolError(
      OPENFX_NODE_ERROR_CODES.protocolMismatch,
      "Unsupported request version.",
    );
  }
  if (
    !Number.isSafeInteger(request.timestamp) ||
    Math.abs(now - request.timestamp) >
      (options.maxClockSkewMs ?? RELAY_MAX_CLOCK_SKEW_MS)
  ) {
    throw protocolError(
      OPENFX_NODE_ERROR_CODES.timestampInvalid,
      "Request timestamp is outside the accepted window.",
    );
  }
  const unsigned = {
    version: request.version,
    method: request.method,
    path: request.path,
    body: request.body,
    bodyDigest: request.bodyDigest,
    timestamp: request.timestamp,
    nonce: request.nonce,
  };
  const actualBodyDigest = await crypto.sha256(utf8(canonicalJson(request.body)));
  const expectedSignature = await crypto.hmacSha256(
    secret,
    utf8(canonicalJson(unsigned)),
  );
  let suppliedDigest: Uint8Array;
  let suppliedSignature: Uint8Array;
  try {
    suppliedDigest = decodeBase64Url(request.bodyDigest);
    suppliedSignature = decodeBase64Url(request.signature);
  } catch {
    throw protocolError(
      OPENFX_NODE_ERROR_CODES.signatureInvalid,
      "Request signature encoding is invalid.",
    );
  }
  if (
    !constantTimeEqual(actualBodyDigest, suppliedDigest) ||
    !constantTimeEqual(expectedSignature, suppliedSignature)
  ) {
    throw protocolError(
      OPENFX_NODE_ERROR_CODES.signatureInvalid,
      "Request signature is invalid.",
    );
  }
  options.replayProtector.consume(request.nonce, request.timestamp, now);
  return true;
}

function protocolError(
  code: ConstructorParameters<typeof OpenFxNodeProtocolError>[0],
  message: string,
): OpenFxNodeProtocolError {
  return new OpenFxNodeProtocolError(code, message);
}
