const ECDSA_ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const ECDH_ALGORITHM = { name: "ECDH", namedCurve: "P-256" } as const;

export type PrivateMeshKeyRef = Readonly<{
  version: 1;
  id: string;
  algorithm: "ECDSA-P256" | "ECDH-P256";
}>;

export type GeneratedPrivateMeshSigningKey = Readonly<{
  ref: PrivateMeshKeyRef;
  publicKey: JsonWebKey;
  recoveryPrivateKey?: JsonWebKey;
}>;

export type GeneratedPrivateMeshEncryptionKey = Readonly<{
  ref: PrivateMeshKeyRef;
  publicKey: JsonWebKey;
}>;

type StoredPrivateMeshKey = Readonly<{
  ref: PrivateMeshKeyRef;
  key: CryptoKey;
  publicKey: JsonWebKey;
}>;

type PrivateMeshKeyStorage = Readonly<{
  get: (id: string) => Promise<StoredPrivateMeshKey | undefined>;
  put: (value: StoredPrivateMeshKey) => Promise<void>;
}>;

export type PrivateMeshKeyVault = Readonly<{
  generateSigningKey: (
    options?: { exportForRecovery?: boolean },
  ) => Promise<GeneratedPrivateMeshSigningKey>;
  generateEncryptionKey: () => Promise<GeneratedPrivateMeshEncryptionKey>;
  importSigningKey: (
    id: string,
    privateKeyJwk: JsonWebKey,
    publicKeyJwk: JsonWebKey,
  ) => Promise<PrivateMeshKeyRef>;
  importEncryptionKey: (
    id: string,
    privateKeyJwk: JsonWebKey,
    publicKeyJwk: JsonWebKey,
  ) => Promise<PrivateMeshKeyRef>;
  matchesPublicKey: (
    ref: PrivateMeshKeyRef,
    publicKeyJwk: JsonWebKey,
  ) => Promise<boolean>;
  deriveAesKey: (
    ref: PrivateMeshKeyRef,
    peerPublicKeyJwk: JsonWebKey,
    usages: readonly ("encrypt" | "decrypt")[],
  ) => Promise<CryptoKey>;
  sign: (ref: PrivateMeshKeyRef, data: BufferSource) => Promise<ArrayBuffer>;
  describe: (ref: PrivateMeshKeyRef) => Promise<
    Readonly<{
      algorithm: PrivateMeshKeyRef["algorithm"];
      extractable: boolean;
      usages: readonly KeyUsage[];
    }>
  >;
}>;

function keyId(): string {
  return `key_${crypto.randomUUID()}`;
}

const KEY_MATCH_CHALLENGE = new TextEncoder().encode(
  "openfx-private-mesh-key-match-v1",
);

function jwkPublicPartsMatch(left: JsonWebKey, right: JsonWebKey): boolean {
  return left.kty === right.kty && left.crv === right.crv &&
    left.x === right.x && left.y === right.y;
}

async function ecdhKeysMatch(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<boolean> {
  const ephemeral = await crypto.subtle.generateKey(ECDH_ALGORITHM, false, [
    "deriveKey",
  ]);
  const [fromImportedPrivate, fromEphemeralPrivate] = await Promise.all([
    crypto.subtle.deriveKey(
      { name: "ECDH", public: ephemeral.publicKey },
      privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    ),
    crypto.subtle.deriveKey(
      { name: "ECDH", public: publicKey },
      ephemeral.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    ),
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    fromImportedPrivate,
    KEY_MATCH_CHALLENGE,
  );
  try {
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      fromEphemeralPrivate,
      ciphertext,
    );
    return true;
  } catch {
    return false;
  }
}

function createPrivateMeshKeyVault(
  storage: PrivateMeshKeyStorage,
): PrivateMeshKeyVault {
  async function stored(ref: PrivateMeshKeyRef): Promise<StoredPrivateMeshKey> {
    const value = await storage.get(ref.id);
    if (!value || value.ref.algorithm !== ref.algorithm) {
      throw new Error("密钥保险库中缺少所需私钥");
    }
    return value;
  }

  async function matchesPublicKey(
    ref: PrivateMeshKeyRef,
    publicKeyJwk: JsonWebKey,
  ): Promise<boolean> {
    const value = await stored(ref);
    if (value.ref.algorithm === "ECDH-P256") {
      return jwkPublicPartsMatch(value.publicKey, publicKeyJwk);
    }
    try {
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        publicKeyJwk,
        ECDSA_ALGORITHM,
        false,
        ["verify"],
      );
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        value.key,
        KEY_MATCH_CHALLENGE,
      );
      return await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signature,
        KEY_MATCH_CHALLENGE,
      );
    } catch {
      return false;
    }
  }

  return {
    async generateSigningKey(
      options: { exportForRecovery?: boolean } = {},
    ): Promise<GeneratedPrivateMeshSigningKey> {
      const pair = await crypto.subtle.generateKey(
        ECDSA_ALGORITHM,
        Boolean(options.exportForRecovery),
        [
          "sign",
          "verify",
        ],
      );
      const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
      const exportedPrivateKey = options.exportForRecovery
        ? await crypto.subtle.exportKey("jwk", pair.privateKey)
        : undefined;
      const privateKey = exportedPrivateKey
        ? await crypto.subtle.importKey(
          "jwk",
          exportedPrivateKey,
          ECDSA_ALGORITHM,
          false,
          ["sign"],
        )
        : pair.privateKey;
      const ref: PrivateMeshKeyRef = {
        version: 1,
        id: keyId(),
        algorithm: "ECDSA-P256",
      };
      await storage.put({ ref, key: privateKey, publicKey });
      return {
        ref,
        publicKey,
        recoveryPrivateKey: exportedPrivateKey,
      };
    },
    async generateEncryptionKey(): Promise<GeneratedPrivateMeshEncryptionKey> {
      const pair = await crypto.subtle.generateKey(ECDH_ALGORITHM, false, [
        "deriveKey",
      ]);
      const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
      const ref: PrivateMeshKeyRef = {
        version: 1,
        id: keyId(),
        algorithm: "ECDH-P256",
      };
      await storage.put({ ref, key: pair.privateKey, publicKey });
      return { ref, publicKey };
    },
    async importSigningKey(
      id: string,
      privateKeyJwk: JsonWebKey,
      publicKeyJwk: JsonWebKey,
    ): Promise<PrivateMeshKeyRef> {
      const ref: PrivateMeshKeyRef = {
        version: 1,
        id,
        algorithm: "ECDSA-P256",
      };
      const existing = await storage.get(id);
      if (existing) {
        if (
          existing.ref.algorithm !== ref.algorithm ||
          !(await matchesPublicKey(ref, publicKeyJwk))
        ) {
          throw new Error("密钥保险库中的既有密钥与导入内容不匹配");
        }
        return ref;
      }

      const [privateKey, publicKey] = await Promise.all([
        crypto.subtle.importKey(
          "jwk",
          privateKeyJwk,
          ECDSA_ALGORITHM,
          false,
          ["sign"],
        ),
        crypto.subtle.importKey(
          "jwk",
          publicKeyJwk,
          ECDSA_ALGORITHM,
          false,
          ["verify"],
        ),
      ]);
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        KEY_MATCH_CHALLENGE,
      );
      if (
        !(await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          publicKey,
          signature,
          KEY_MATCH_CHALLENGE,
        ))
      ) {
        throw new Error("导入的签名私钥与公钥不匹配");
      }
      await storage.put({ ref, key: privateKey, publicKey: publicKeyJwk });
      return ref;
    },
    async importEncryptionKey(
      id: string,
      privateKeyJwk: JsonWebKey,
      publicKeyJwk: JsonWebKey,
    ): Promise<PrivateMeshKeyRef> {
      const ref: PrivateMeshKeyRef = {
        version: 1,
        id,
        algorithm: "ECDH-P256",
      };
      const existing = await storage.get(id);
      if (existing) {
        if (
          existing.ref.algorithm !== ref.algorithm ||
          !jwkPublicPartsMatch(existing.publicKey, publicKeyJwk)
        ) {
          throw new Error("密钥保险库中的既有密钥与导入内容不匹配");
        }
        return ref;
      }
      const [privateKey, publicKey] = await Promise.all([
        crypto.subtle.importKey(
          "jwk",
          privateKeyJwk,
          ECDH_ALGORITHM,
          false,
          ["deriveKey"],
        ),
        crypto.subtle.importKey(
          "jwk",
          publicKeyJwk,
          ECDH_ALGORITHM,
          false,
          [],
        ),
      ]);
      if (!(await ecdhKeysMatch(privateKey, publicKey))) {
        throw new Error("导入的加密私钥与公钥不匹配");
      }
      await storage.put({ ref, key: privateKey, publicKey: publicKeyJwk });
      return ref;
    },
    matchesPublicKey,
    async deriveAesKey(
      ref: PrivateMeshKeyRef,
      peerPublicKeyJwk: JsonWebKey,
      usages: readonly ("encrypt" | "decrypt")[],
    ): Promise<CryptoKey> {
      const value = await stored(ref);
      if (value.ref.algorithm !== "ECDH-P256") {
        throw new Error("该密钥不能用于协商共享密钥");
      }
      const peerPublicKey = await crypto.subtle.importKey(
        "jwk",
        peerPublicKeyJwk,
        ECDH_ALGORITHM,
        false,
        [],
      );
      return await crypto.subtle.deriveKey(
        { name: "ECDH", public: peerPublicKey },
        value.key,
        { name: "AES-GCM", length: 256 },
        false,
        [...usages],
      );
    },
    async sign(ref: PrivateMeshKeyRef, data: BufferSource): Promise<ArrayBuffer> {
      const value = await stored(ref);
      if (value.ref.algorithm !== "ECDSA-P256") {
        throw new Error("该密钥不能用于签名");
      }
      return await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        value.key,
        data,
      );
    },
    async describe(ref: PrivateMeshKeyRef): Promise<
      Readonly<{
        algorithm: PrivateMeshKeyRef["algorithm"];
        extractable: boolean;
        usages: readonly KeyUsage[];
      }>
    > {
      const value = await stored(ref);
      return {
        algorithm: value.ref.algorithm,
        extractable: value.key.extractable,
        usages: value.key.usages,
      };
    },
  };
}

export function createMemoryPrivateMeshKeyVault(): PrivateMeshKeyVault {
  const keys = new Map<string, StoredPrivateMeshKey>();
  return createPrivateMeshKeyVault({
    get: (id) => Promise.resolve(keys.get(id)),
    put: (value) => {
      keys.set(value.ref.id, value);
      return Promise.resolve();
    },
  });
}

const PRIVATE_MESH_KEY_DB = "openfx-private-mesh-key-vault";
const PRIVATE_MESH_KEY_STORE = "keys";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("密钥保险库访问失败"));
  });
}

export function createIndexedDbPrivateMeshKeyVault(): PrivateMeshKeyVault {
  if (!globalThis.indexedDB) {
    throw new Error("当前浏览器不支持本机密钥保险库");
  }
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PRIVATE_MESH_KEY_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PRIVATE_MESH_KEY_STORE)) {
        request.result.createObjectStore(PRIVATE_MESH_KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开密钥保险库"));
    request.onblocked = () => reject(new Error("密钥保险库升级被其他页面阻止"));
  });

  return createPrivateMeshKeyVault({
    async get(id) {
      const db = await database;
      const transaction = db.transaction(PRIVATE_MESH_KEY_STORE, "readonly");
      return await requestResult<StoredPrivateMeshKey | undefined>(
        transaction.objectStore(PRIVATE_MESH_KEY_STORE).get(id),
      );
    },
    async put(value) {
      const db = await database;
      const transaction = db.transaction(PRIVATE_MESH_KEY_STORE, "readwrite");
      await requestResult(
        transaction.objectStore(PRIVATE_MESH_KEY_STORE).put(value, value.ref.id),
      );
    },
  });
}
