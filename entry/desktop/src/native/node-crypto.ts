import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { Buffer } from "node:buffer";

import type { NodeCryptoAdapter } from "../../../../domains/_shared/openfx-node/crypto.ts";

export const createNodeCryptoAdapter = (): NodeCryptoAdapter => ({
  randomBytes(length) {
    return bytes(randomBytes(length));
  },
  sha256(data) {
    return Promise.resolve(bytes(createHash("sha256").update(data).digest()));
  },
  hkdfSha256(keyMaterial, salt, info, length) {
    return Promise.resolve(
      bytes(hkdfSync("sha256", keyMaterial, salt, info, length)),
    );
  },
  aes256GcmEncrypt(key, iv, plaintext, additionalData) {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(additionalData);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return Promise.resolve(bytes(ciphertext));
  },
  aes256GcmDecrypt(key, iv, ciphertext, additionalData) {
    if (ciphertext.length < 16) {
      return Promise.reject(new Error("invalid_gcm_payload"));
    }
    const payload = ciphertext.slice(0, -16);
    const tag = ciphertext.slice(-16);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(additionalData);
    decipher.setAuthTag(tag);
    return Promise.resolve(
      bytes(Buffer.concat([decipher.update(payload), decipher.final()])),
    );
  },
  hmacSha256(key, data) {
    return Promise.resolve(
      bytes(createHmac("sha256", key).update(data).digest()),
    );
  },
});

const bytes = (value: ArrayBuffer | ArrayBufferView): Uint8Array =>
  value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
