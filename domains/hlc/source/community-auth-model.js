import { ROLES } from "./community-access-model.js";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const SESSION_COOKIE = "hlc_session";
const DEFAULT_PASSWORD_ITERATIONS = 210_000;
const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/,
    "",
  );
}

function fromBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function normalizeUsername(value) {
  const username = String(value ?? "").trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new TypeError("账号需为 3 至 64 位字母、数字、点、短横线或下划线");
  }
  return username;
}

export function normalizeDisplayName(value) {
  const displayName = String(value ?? "").trim().replace(/\s+/g, " ");
  if (displayName.length < 2 || displayName.length > 40) {
    throw new TypeError("姓名或称呼需为 2 至 40 个字符");
  }
  return displayName;
}

export async function createSelfRegisteredResident(input, options = {}) {
  const now = options.now ?? Date.now();
  return Object.freeze({
    id: options.id ?? crypto.randomUUID(),
    username: normalizeUsername(input?.username),
    displayName: normalizeDisplayName(input?.displayName),
    role: ROLES.RESIDENT,
    status: "active",
    credential: await createPasswordCredential(
      input?.password,
      options.credentialOptions,
    ),
    createdAt: now,
    updatedAt: now,
  });
}

export async function createPasswordCredential(password, options = {}) {
  if (typeof password !== "string" || password.length < 10) {
    throw new TypeError("密码至少需要 10 个字符");
  }
  if (password.length > 256) {
    throw new TypeError("密码最多需要 256 个字符");
  }
  const iterations = Number(options.iterations) || DEFAULT_PASSWORD_ITERATIONS;
  const salt = options.salt ?? randomBytes(16);
  const hash = await derivePassword(password, salt, iterations);
  return Object.freeze({
    algorithm: "PBKDF2-SHA-256",
    iterations,
    salt: toBase64Url(salt),
    hash: toBase64Url(hash),
  });
}

export async function verifyPassword(password, credential) {
  if (
    !credential || credential.algorithm !== "PBKDF2-SHA-256" ||
    !Number.isSafeInteger(credential.iterations)
  ) return false;
  try {
    const candidate = await derivePassword(
      String(password ?? ""),
      fromBase64Url(credential.salt),
      credential.iterations,
    );
    return timingSafeEqual(candidate, fromBase64Url(credential.hash));
  } catch (_error) {
    return false;
  }
}

export function createSessionSecret() {
  return toBase64Url(randomBytes(32));
}

export async function digestSessionSecret(secret) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return toBase64Url(new Uint8Array(digest));
}

function cookieSecurity(secure) {
  return secure ? "; Secure" : "";
}

export function createSessionCookie(secret, options = {}) {
  const maxAge = Math.max(60, Number(options.maxAge) || 60 * 60 * 12);
  return `${SESSION_COOKIE}=${
    encodeURIComponent(secret)
  }; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
    cookieSecurity(options.secure)
  }`;
}

export function clearSessionCookie(options = {}) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    cookieSecurity(options.secure)
  }`;
}

export function readSessionSecret(headers) {
  const cookie = headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}
