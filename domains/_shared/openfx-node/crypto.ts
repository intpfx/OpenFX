export interface NodeCryptoAdapter {
  randomBytes(length: number): Uint8Array;
  digestSha256(data: Uint8Array): Promise<Uint8Array>;
  hkdfSha256(
    keyMaterial: Uint8Array,
    salt: Uint8Array,
    info: Uint8Array,
    length: number,
  ): Promise<Uint8Array>;
  aes256GcmEncrypt(
    key: Uint8Array,
    iv: Uint8Array,
    plaintext: Uint8Array,
    additionalData: Uint8Array,
  ): Promise<Uint8Array>;
  aes256GcmDecrypt(
    key: Uint8Array,
    iv: Uint8Array,
    ciphertext: Uint8Array,
    additionalData: Uint8Array,
  ): Promise<Uint8Array>;
  hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array>;
}

export function createWebCryptoAdapter(
  webCrypto: Crypto = globalThis.crypto,
): NodeCryptoAdapter {
  return {
    randomBytes(length) {
      return webCrypto.getRandomValues(new Uint8Array(length));
    },
    async digestSha256(data) {
      return bytes(await webCrypto.subtle.digest("SHA-256", bytes(data)));
    },
    async hkdfSha256(keyMaterial, salt, info, length) {
      const key = await webCrypto.subtle.importKey(
        "raw",
        bytes(keyMaterial),
        "HKDF",
        false,
        ["deriveBits"],
      );
      const result = await webCrypto.subtle.deriveBits(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: bytes(salt),
          info: bytes(info),
        },
        key,
        length * 8,
      );
      return bytes(result);
    },
    async aes256GcmEncrypt(keyBytes, iv, plaintext, additionalData) {
      const key = await importAesKey(webCrypto, keyBytes, "encrypt");
      const result = await webCrypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: bytes(iv),
          additionalData: bytes(additionalData),
          tagLength: 128,
        },
        key,
        bytes(plaintext),
      );
      return bytes(result);
    },
    async aes256GcmDecrypt(keyBytes, iv, ciphertext, additionalData) {
      const key = await importAesKey(webCrypto, keyBytes, "decrypt");
      const result = await webCrypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: bytes(iv),
          additionalData: bytes(additionalData),
          tagLength: 128,
        },
        key,
        bytes(ciphertext),
      );
      return bytes(result);
    },
    async hmacSha256(keyBytes, data) {
      const key = await webCrypto.subtle.importKey(
        "raw",
        bytes(keyBytes),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      return bytes(await webCrypto.subtle.sign("HMAC", key, bytes(data)));
    },
  };
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index++) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function importAesKey(
  webCrypto: Crypto,
  keyBytes: Uint8Array,
  usage: "encrypt" | "decrypt",
): Promise<CryptoKey> {
  if (keyBytes.length !== 32) {
    throw new TypeError("AES-256-GCM requires a 32-byte key.");
  }
  return await webCrypto.subtle.importKey(
    "raw",
    bytes(keyBytes),
    "AES-GCM",
    false,
    [usage],
  );
}

function bytes(value: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  return value instanceof Uint8Array
    ? Uint8Array.from(value)
    : new Uint8Array(value.slice(0));
}
