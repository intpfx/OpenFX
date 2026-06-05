/**
 * SWT — String Web Token 轻量级认证系统
 *
 * 提取自 core/serve.js Account 静态类（第5520-5749行）
 *
 * 基于 Web Crypto API 的纯函数式 token 认证方案：
 *   - AES-GCM（256-bit）加密 token 载荷
 *   - HMAC-SHA256 签名防篡改
 *   - 双密钥轮换容错（主密钥 + 辅助密钥）
 *
 * 格式：`{ivBase64}.{encryptedBase64}.{hmacSignatureBase64}`
 *
 * 浏览器和 Deno 双平台兼容（均支持 Web Crypto API）。
 *
 * 注意：原实现中 `System.principalSecretKey` / `System.auxiliarySecretKey` /
 * `System.principalHashKey` / `System.auxiliaryHashKey` 已参数化，
 * 调用方需自行管理密钥存储与轮换。
 *
 * @module
 */

// ── 类型定义 ──

/** AES-GCM 加密结果 */
export interface EncryptedToken {
  /** IV（Base64 编码） */
  ivBase64: string;
  /** 密文（Base64 编码） */
  encryptedBase64: string;
}

/** generateStringWebToken 的返回结果 */
export interface GenSwtResult {
  ok: boolean;
  message?: string;
  stringWebToken?: string;
}

/** parseStringWebToken 的返回结果 */
export interface ParseSwtResult {
  status: string;
  value?: {
    host: string;
    power: string;
    timestamp: string;
  };
}

/** 密钥对配置 */
export interface SwtKeyPair {
  /** AES-GCM 加密密钥（raw Uint8Array） */
  secretKey: Uint8Array;
  /** HMAC-SHA256 签名密钥（raw Uint8Array） */
  hashKey: Uint8Array;
}

// ── 工具函数 ──

/**
 * Uint8Array → Base64 编码（浏览器兼容）。
 * 使用 btoa + String.fromCharCode 方式，Deno 和浏览器均可运行。
 */
function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Base64 → Uint8Array 解码（浏览器兼容）。
 */
function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── 密钥生成与导入导出 ──

/**
 * 生成 AES-GCM 256-bit 加密密钥。
 *
 * 提取自 core/serve.js Account.generateSecretKey（第5610-5618行）
 */
export async function generateSecretKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/**
 * 生成 HMAC-SHA256 签名密钥。
 *
 * 提取自 core/serve.js Account.generateHashKey（第5620-5629行）
 */
export async function generateHashKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256", length: 256 },
    true,
    ["sign", "verify"],
  );
}

/**
 * 导出 CryptoKey 为 raw Uint8Array。
 *
 * 提取自 core/serve.js Account.exportKey（第5631-5632行）
 */
export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}

/**
 * 从 raw Uint8Array 导入密钥。
 *
 * @param type   - "secret" 导入为 AES-GCM 密钥，"hash" 导入为 HMAC-SHA256 密钥
 * @param rawKey - raw 格式的密钥字节
 *
 * 提取自 core/serve.js Account.importKey（第5634-5635行）
 */
export async function importKey(
  type: "secret" | "hash",
  rawKey: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  if (type === "secret") {
    return await crypto.subtle.importKey(
      "raw",
      rawKey,
      "AES-GCM",
      true,
      ["encrypt", "decrypt"],
    );
  }
  return await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
}

/**
 * 生成并导出加密密钥对（secretKey + hashKey）。
 * 方便一键生成存储到数据库的密钥。
 */
export async function generateKeyPair(): Promise<SwtKeyPair> {
  const [secretKey, hashKey] = await Promise.all([
    generateSecretKey(),
    generateHashKey(),
  ]);
  const [secretRaw, hashRaw] = await Promise.all([
    exportKey(secretKey),
    exportKey(hashKey),
  ]);
  return { secretKey: secretRaw, hashKey: hashRaw };
}

// ── AES-GCM 加解密 ──

/**
 * 使用 AES-GCM 加密 token 明文。
 *
 * @param token     - 明文字符串
 * @param secretKey - AES-GCM 密钥（raw Uint8Array）
 * @returns IV 和密文的 Base64 编码
 *
 * 提取自 core/serve.js Account.encryptToken（第5645-5659行）
 */
export async function encryptToken(
  token: string,
  secretKey: Uint8Array,
): Promise<EncryptedToken> {
  const encoded = new TextEncoder().encode(token);
  const key = await importKey("secret", secretKey as Uint8Array<ArrayBuffer>);
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  return {
    ivBase64: uint8ToBase64(iv),
    encryptedBase64: uint8ToBase64(new Uint8Array(encrypted)),
  };
}

/**
 * 使用 AES-GCM 解密 token 密文。
 *
 * @param ivBase64        - IV（Base64 编码）
 * @param encryptedBase64 - 密文（Base64 编码）
 * @param secretKey       - AES-GCM 密钥（raw Uint8Array）
 * @returns 解密后的明文字符串
 *
 * 提取自 core/serve.js Account.decryptToken（第5661-5673行）
 */
export async function decryptToken(
  ivBase64: string,
  encryptedBase64: string,
  secretKey: Uint8Array,
): Promise<string> {
  const iv = base64ToUint8(ivBase64) as Uint8Array<ArrayBuffer>;
  const encrypted = base64ToUint8(encryptedBase64) as Uint8Array<ArrayBuffer>;
  const key = await importKey("secret", secretKey as Uint8Array<ArrayBuffer>);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted,
  );
  return new TextDecoder().decode(decrypted);
}

// ── HMAC 签名与验证 ──

/**
 * 对未签名的 SWT（`iv.token` 部分）进行 HMAC-SHA256 签名。
 *
 * @param unsignedStringWebToken - 未签名的 SWT（`{ivBase64}.{encryptedBase64}`）
 * @param hashKey                - HMAC 密钥（raw Uint8Array）
 * @returns Base64 编码的签名
 *
 * 提取自 core/serve.js Account.hashSwt（第5675-5679行）
 */
export async function hashSwt(
  unsignedStringWebToken: string,
  hashKey: Uint8Array,
): Promise<string> {
  const encoded = new TextEncoder().encode(unsignedStringWebToken);
  const key = await importKey("hash", hashKey as Uint8Array<ArrayBuffer>);
  const signature = await crypto.subtle.sign("HMAC", key, encoded);
  return uint8ToBase64(new Uint8Array(signature));
}

/**
 * 验证 SWT 的 HMAC-SHA256 签名。
 *
 * @param stringWebToken - 完整 SWT（`{iv}.{token}.{signature}`）
 * @param hashKey        - HMAC 密钥（raw Uint8Array）
 * @returns 签名是否有效
 *
 * 提取自 core/serve.js Account.verifySwt（第5681-5687行）
 */
export async function verifySwt(
  stringWebToken: string,
  hashKey: Uint8Array,
): Promise<boolean> {
  const key = await importKey("hash", hashKey as Uint8Array<ArrayBuffer>);
  const [iv, token, signature] = stringWebToken.split(".");
  const unsignedStringWebToken = `${iv}.${token}`;
  const encoded = new TextEncoder().encode(unsignedStringWebToken);
  const signatureArray = base64ToUint8(signature);
  return await crypto.subtle.verify("HMAC", key, signatureArray as Uint8Array<ArrayBuffer>, encoded);
}

// ── Token 签发 ──

/**
 * 签发生成一个 String Web Token。
 *
 * Token 载荷格式：`{host}_{power}_{timestamp}`
 * 其中 timestamp 为当前时间 + 1 小时（有效期 1 小时）。
 *
 * @param currentHost     - 当前站点 host
 * @param power           - 用户权限标识
 * @param timestampOffset - 有效期偏移（毫秒），默认 3600000（1 小时）
 * @param secretKey       - AES-GCM 加密密钥（raw Uint8Array）
 * @param hashKey         - HMAC 签名密钥（raw Uint8Array）
 * @returns 完整的 SWT 字符串
 *
 * 提取自 core/serve.js Account.genrateStringWebToken（第5689-5711行）
 */
export async function generateStringWebToken(
  currentHost: string,
  power: string,
  timestampOffset: number = 3600000,
  secretKey: Uint8Array,
  hashKey: Uint8Array,
): Promise<string> {
  const timestamp = new Date().getTime() + timestampOffset;
  const rawToken = `${currentHost}_${power}_${timestamp}`;
  const { ivBase64, encryptedBase64 } = await encryptToken(rawToken, secretKey);
  const unsignedStringWebToken = `${ivBase64}.${encryptedBase64}`;
  const signature = await hashSwt(unsignedStringWebToken, hashKey);
  return `${unsignedStringWebToken}.${signature}`;
}

/**
 * 生成普通访客 SWT（无权限）。
 *
 * 载荷固定为 "Normal_r0w0_0000000000000"。
 *
 * @param secretKey - AES-GCM 加密密钥（raw Uint8Array）
 * @param hashKey   - HMAC 签名密钥（raw Uint8Array）
 * @returns 普通访客 SWT 字符串
 *
 * 提取自 core/serve.js Account.genrateNormalStringWebToken（第5713-5718行）
 */
export async function generateNormalStringWebToken(
  secretKey: Uint8Array,
  hashKey: Uint8Array,
): Promise<string> {
  const rawToken = "Normal_r0w0_0000000000000";
  const { ivBase64, encryptedBase64 } = await encryptToken(rawToken, secretKey);
  const unsignedStringWebToken = `${ivBase64}.${encryptedBase64}`;
  const signature = await hashSwt(unsignedStringWebToken, hashKey);
  return `${unsignedStringWebToken}.${signature}`;
}

// ── Token 解析 ──

/**
 * 解析并验证 String Web Token。
 *
 * 支持双密钥轮换容错：先用主密钥验证/解密，失败则尝试辅助密钥。
 *
 * @param swt               - 完整 SWT 字符串
 * @param primarySecretKey   - 主 AES-GCM 加密密钥（raw Uint8Array）
 * @param primaryHashKey    - 主 HMAC 签名密钥（raw Uint8Array）
 * @param auxiliarySecretKey - 辅助 AES-GCM 加密密钥（raw Uint8Array，可选）
 * @param auxiliaryHashKey  - 辅助 HMAC 签名密钥（raw Uint8Array，可选）
 * @returns 解析结果，包含 host / power / timestamp
 *
 * 提取自 core/serve.js Account.parseStringWebToken（第5720-5748行）
 */
export async function parseStringWebToken(
  swt: string,
  primarySecretKey: Uint8Array,
  primaryHashKey: Uint8Array,
  auxiliarySecretKey?: Uint8Array,
  auxiliaryHashKey?: Uint8Array,
): Promise<ParseSwtResult> {
  // 1. 验证 HMAC 签名（双密钥容错）
  let verifyResult: boolean;
  try {
    verifyResult = await verifySwt(swt, primaryHashKey);
  } catch {
    if (auxiliaryHashKey) {
      try {
        verifyResult = await verifySwt(swt, auxiliaryHashKey);
      } catch {
        verifyResult = false;
      }
    } else {
      verifyResult = false;
    }
  }

  if (!verifyResult) {
    return { status: "验证失败" };
  }

  // 2. 解密 token（双密钥容错）
  const [iv, encrypted] = swt.split(".");
  let rawToken: string;

  try {
    rawToken = await decryptToken(iv, encrypted, primarySecretKey);
  } catch {
    if (auxiliarySecretKey) {
      try {
        rawToken = await decryptToken(iv, encrypted, auxiliarySecretKey);
      } catch {
        rawToken = "Normal_r0w0_0000000000000";
      }
    } else {
      rawToken = "Normal_r0w0_0000000000000";
    }
  }

  // 3. 解析载荷
  if (rawToken === "Normal_r0w0_0000000000000") {
    return { status: "解析失败" };
  }

  const [host, power, timestamp] = rawToken.split("_");
  return {
    status: "解析成功",
    value: { host, power, timestamp },
  };
}
