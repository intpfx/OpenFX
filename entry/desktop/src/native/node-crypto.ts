import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { Buffer } from "node:buffer";

import type { NodeCryptoAdapter } from "../../../../domains/_shared/openfx-node/crypto.ts";

export const createNodeCryptoAdapter = (): NodeCryptoAdapter => ({
  randomBytes(length) {
    return bytes(randomBytes(length));
  },
  digestSha256: digestSha256Bytes,
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

export const digestSha256Bytes = (data: Uint8Array): Promise<Uint8Array> => {
  const digest = hash("sha256", data, "hex");
  return Promise.resolve(decodeHex(digest));
};

const bytes = (value: ArrayBuffer | ArrayBufferView): Uint8Array => {
  if (value instanceof ArrayBuffer) return new Uint8Array(value).slice();
  // Perry's native Buffer bridge does not expose a trustworthy `.buffer`
  // backing store. Copy the visible bytes so hashes and authentication tags
  // cannot accidentally include unrelated or zero-filled storage.
  const source = value as Uint8Array;
  const copy = new Uint8Array(source.byteLength);
  for (let index = 0; index < source.byteLength; index++) {
    copy[index] = source[index] ?? 0;
  }
  return copy;
};

const decodeHex = (value: string): Uint8Array => {
  if (value.length % 2 !== 0) throw new TypeError("invalid_hex_digest");
  const result: number[] = [];
  for (let index = 0; index < value.length; index += 2) {
    const byte = Number.parseInt(value.slice(index, index + 2), 16);
    if (!Number.isInteger(byte)) throw new TypeError("invalid_hex_digest");
    result.push(byte);
  }
  return Uint8Array.from(result);
};
