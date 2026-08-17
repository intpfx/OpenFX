const RECOVERY_PREFIX = "openfx-recovery-v2";
const RECOVERY_AAD = new TextEncoder().encode(RECOVERY_PREFIX);
const UTF8 = new TextEncoder();
const UTF8_DECODER = new TextDecoder();
const PBKDF2_ITERATIONS = 600_000;

type RecoveryEnvelope = Readonly<{
  version: 2;
  kdf: Readonly<{
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
  }>;
  cipher: Readonly<{
    name: "AES-GCM";
    iv: string;
  }>;
  ciphertext: string;
}>;

function bytesToBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function validPassphrase(value: string): string {
  if ([...value].length < 12) throw new Error("恢复口令至少需要 12 个字符");
  if ([...value].length > 256) throw new Error("恢复口令不能超过 256 个字符");
  return value;
}

async function deriveRecoveryKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    UTF8.encode(validPassphrase(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

function isRecoveryEnvelope(value: unknown): value is RecoveryEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecoveryEnvelope>;
  return candidate.version === 2 &&
    candidate.kdf?.name === "PBKDF2" &&
    candidate.kdf.hash === "SHA-256" &&
    candidate.kdf.iterations === PBKDF2_ITERATIONS &&
    typeof candidate.kdf.salt === "string" &&
    candidate.cipher?.name === "AES-GCM" &&
    typeof candidate.cipher.iv === "string" &&
    typeof candidate.ciphertext === "string";
}

export async function encryptPrivateMeshRecoveryCode<T extends object>(
  recovery: T,
  passphrase: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveRecoveryKey(
    passphrase,
    salt,
    PBKDF2_ITERATIONS,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: RECOVERY_AAD },
    key,
    UTF8.encode(JSON.stringify(recovery)),
  );
  const envelope: RecoveryEnvelope = {
    version: 2,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64Url(salt),
    },
    cipher: { name: "AES-GCM", iv: bytesToBase64Url(iv) },
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
  return `${RECOVERY_PREFIX}.${
    bytesToBase64Url(UTF8.encode(JSON.stringify(envelope)))
  }`;
}

export async function decryptPrivateMeshRecoveryCode<T = unknown>(
  code: string,
  passphrase: string,
): Promise<T> {
  try {
    const normalized = code.trim();
    if (!normalized.startsWith(`${RECOVERY_PREFIX}.`)) throw new Error("invalid code");
    const parsed = JSON.parse(
      UTF8_DECODER.decode(
        base64UrlToBytes(normalized.slice(RECOVERY_PREFIX.length + 1)),
      ),
    );
    if (!isRecoveryEnvelope(parsed)) throw new Error("invalid envelope");
    const key = await deriveRecoveryKey(
      passphrase,
      base64UrlToBytes(parsed.kdf.salt),
      parsed.kdf.iterations,
      ["decrypt"],
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlToBytes(parsed.cipher.iv),
        additionalData: RECOVERY_AAD,
      },
      key,
      base64UrlToBytes(parsed.ciphertext),
    );
    return JSON.parse(UTF8_DECODER.decode(plaintext)) as T;
  } catch {
    throw new Error("恢复码或恢复口令无效");
  }
}
