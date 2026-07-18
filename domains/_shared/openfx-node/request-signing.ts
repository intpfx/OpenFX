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

export interface SignRequestOptions {
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
}

export interface VerifySignedRequestOptions {
  now?: () => number;
  replayProtector: ReplayProtector;
  maxClockSkewMs?: number;
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
