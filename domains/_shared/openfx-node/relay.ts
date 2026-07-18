import {
  OPENFX_NODE_ERROR_CODES,
  PROTOCOL_VERSION,
  RELAY_MAX_CLOCK_SKEW_MS,
} from "./constants.ts";
import { constantTimeEqual, type NodeCryptoAdapter } from "./crypto.ts";
import {
  canonicalJson,
  decodeBase64Url,
  decodeUtf8,
  encodeBase64Url,
  utf8,
} from "./encoding.ts";
import { OpenFxNodeProtocolError } from "./errors.ts";
import type { ReplayProtector } from "./replay.ts";
import type { SealedRelayEnvelope } from "./types.ts";

const ENCRYPTION_INFO = utf8("openfx-node/v1/relay/encryption");
const SIGNING_INFO = utf8("openfx-node/v1/relay/signing");

export interface SealRelayOptions {
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
}

export interface OpenRelayOptions {
  now?: () => number;
  replayProtector: ReplayProtector;
  maxClockSkewMs?: number;
}

export async function sealRelayEnvelope(
  crypto: NodeCryptoAdapter,
  secret: Uint8Array,
  payload: unknown,
  options: SealRelayOptions = {},
): Promise<SealedRelayEnvelope> {
  const now = options.now ?? Date.now;
  const randomBytes = options.randomBytes ?? crypto.randomBytes;
  const timestamp = now();
  const nonceBytes = randomBytes(16);
  const iv = randomBytes(12);
  const nonce = encodeBase64Url(nonceBytes);
  const aad = envelopeAad(timestamp, nonce);
  const encryptionKey = await crypto.hkdfSha256(
    secret,
    nonceBytes,
    ENCRYPTION_INFO,
    32,
  );
  const ciphertext = encodeBase64Url(
    await crypto.aes256GcmEncrypt(
      encryptionKey,
      iv,
      utf8(canonicalJson(payload)),
      aad,
    ),
  );
  const unsigned = {
    version: PROTOCOL_VERSION,
    timestamp,
    nonce,
    iv: encodeBase64Url(iv),
    ciphertext,
  } as const;
  const signingKey = await crypto.hkdfSha256(secret, nonceBytes, SIGNING_INFO, 32);
  const signature = encodeBase64Url(
    await crypto.hmacSha256(signingKey, utf8(canonicalJson(unsigned))),
  );
  return { ...unsigned, signature };
}

export async function openRelayEnvelope<T = unknown>(
  crypto: NodeCryptoAdapter,
  secret: Uint8Array,
  envelope: SealedRelayEnvelope,
  options: OpenRelayOptions,
): Promise<T> {
  validateEnvelope(envelope, options.now?.() ?? Date.now(), options.maxClockSkewMs);
  let nonceBytes: Uint8Array;
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  let signature: Uint8Array;
  try {
    nonceBytes = decodeBase64Url(envelope.nonce);
    iv = decodeBase64Url(envelope.iv);
    ciphertext = decodeBase64Url(envelope.ciphertext);
    signature = decodeBase64Url(envelope.signature);
  } catch {
    throw new OpenFxNodeProtocolError(
      OPENFX_NODE_ERROR_CODES.envelopeInvalid,
      "Envelope encoding is invalid.",
    );
  }

  const signingKey = await crypto.hkdfSha256(secret, nonceBytes, SIGNING_INFO, 32);
  const expected = await crypto.hmacSha256(
    signingKey,
    utf8(canonicalJson(unsignedEnvelope(envelope))),
  );
  if (!constantTimeEqual(expected, signature)) {
    throw new OpenFxNodeProtocolError(
      OPENFX_NODE_ERROR_CODES.signatureInvalid,
      "Relay envelope signature is invalid.",
    );
  }

  const now = options.now?.() ?? Date.now();
  options.replayProtector.consume(envelope.nonce, envelope.timestamp, now);
  const encryptionKey = await crypto.hkdfSha256(
    secret,
    nonceBytes,
    ENCRYPTION_INFO,
    32,
  );
  try {
    const plaintext = await crypto.aes256GcmDecrypt(
      encryptionKey,
      iv,
      ciphertext,
      envelopeAad(envelope.timestamp, envelope.nonce),
    );
    return JSON.parse(decodeUtf8(plaintext)) as T;
  } catch {
    throw new OpenFxNodeProtocolError(
      OPENFX_NODE_ERROR_CODES.envelopeInvalid,
      "Relay envelope could not be decrypted.",
    );
  }
}

function validateEnvelope(
  envelope: SealedRelayEnvelope,
  now: number,
  maxClockSkewMs = RELAY_MAX_CLOCK_SKEW_MS,
): void {
  if (envelope.version !== PROTOCOL_VERSION) {
    throw new OpenFxNodeProtocolError(
      OPENFX_NODE_ERROR_CODES.protocolMismatch,
      "Unsupported relay protocol version.",
    );
  }
  if (
    !Number.isSafeInteger(envelope.timestamp) ||
    Math.abs(now - envelope.timestamp) > maxClockSkewMs
  ) {
    throw new OpenFxNodeProtocolError(
      OPENFX_NODE_ERROR_CODES.timestampInvalid,
      "Relay envelope timestamp is outside the accepted window.",
    );
  }
}

function envelopeAad(timestamp: number, nonce: string): Uint8Array {
  return utf8(canonicalJson({ version: PROTOCOL_VERSION, timestamp, nonce }));
}

function unsignedEnvelope(envelope: SealedRelayEnvelope) {
  return {
    version: envelope.version,
    timestamp: envelope.timestamp,
    nonce: envelope.nonce,
    iv: envelope.iv,
    ciphertext: envelope.ciphertext,
  };
}
