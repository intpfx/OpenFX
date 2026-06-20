import { getKv } from "../../../domains/_shared/kv.ts";

const MESSAGE_PREFIX = ["homepage-messages"] as const;
const MESSAGE_RATE_PREFIX = ["homepage-message-rate"] as const;
const MAX_CONTENT_LENGTH = 1_000;
const MESSAGE_RATE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export const MESSAGE_BODY_MAX_BYTES = 4_096;
export const MESSAGE_DAILY_IP_LIMIT = 3;

export type HomepageMessageRecord = {
  id: string;
  content: string;
  createdAt: string;
};

export type HomepageMessageInput = {
  content?: unknown;
  clientIp?: string;
  now?: Date;
};

export type HomepageMessageRateRecord = {
  count: number;
  day: string;
  updatedAt: string;
};

export class HomepageMessageInputError extends TypeError {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
  }
}

export class HomepageMessageRateLimitError extends Error {
  constructor() {
    super("daily_message_limit");
  }
}

const textEncoder = new TextEncoder();
const zeroWidthCharacters = /[\u200b-\u200f\ufeff]/g;
const dangerousProtocol = /\b(javascript|data|vbscript)\s*:/gi;

const toHex = (bytes: ArrayBuffer) => {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const sanitizeHomepageMessageContent = (value: string): string => {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return !(
        code <= 0x08 ||
        code === 0x0b ||
        code === 0x0c ||
        (code >= 0x0e && code <= 0x1f) ||
        code === 0x7f
      );
    })
    .join("")
    .replace(zeroWidthCharacters, "")
    .replace(dangerousProtocol, (_match, protocol: string) => `${protocol}：`)
    .replace(/&/g, "＆")
    .replace(/</g, "＜")
    .replace(/>/g, "＞")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CONTENT_LENGTH);
};

export const getHomepageMessageRateDay = (now = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).formatToParts(now);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  return `${partMap.get("year")}-${partMap.get("month")}-${partMap.get("day")}`;
};

export const hashHomepageMessageClientId = async (
  clientId: string,
): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(clientId));
  return toHex(digest).slice(0, 32);
};

export const homepageMessageRateKey = (
  day: string,
  clientHash: string,
) => [
  ...MESSAGE_RATE_PREFIX,
  day,
  clientHash,
];

const normalizeClientIp = (value: string) => {
  const firstValue = value.split(",")[0]?.trim() ?? "";
  const withoutQuotes = firstValue.replace(/^"|"$/g, "");
  const withoutBrackets = withoutQuotes.replace(/^\[|\]$/g, "");
  const normalized = withoutBrackets.replace(/[^\da-fA-F:.%-]/g, "").slice(0, 96);
  return normalized || "unknown";
};

export const getHomepageMessageClientIp = (req: Request): string => {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return normalizeClientIp(cfIp);

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return normalizeClientIp(realIp);

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return normalizeClientIp(forwardedFor);

  const forwarded = req.headers.get("forwarded");
  const forwardedIp = forwarded?.match(/(?:^|[;,]\s*)for=([^;,]+)/i)?.[1] ?? "";
  if (forwardedIp) return normalizeClientIp(forwardedIp);

  return "unknown";
};

export const homepageMessageKey = (
  message: Pick<HomepageMessageRecord, "createdAt" | "id">,
) => [
  ...MESSAGE_PREFIX,
  message.createdAt,
  message.id,
];

export const listHomepageMessages = async (
  limit = 20,
): Promise<HomepageMessageRecord[]> => {
  const kv = await getKv();
  const messages: HomepageMessageRecord[] = [];

  for await (
    const entry of kv.list<HomepageMessageRecord>({ prefix: [...MESSAGE_PREFIX] })
  ) {
    if (entry.value) {
      messages.push(entry.value);
    }
  }

  return messages
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, limit);
};

export const saveHomepageMessage = async (
  input: HomepageMessageInput,
): Promise<HomepageMessageRecord> => {
  const content = typeof input.content === "string"
    ? sanitizeHomepageMessageContent(input.content)
    : "";
  if (!content) {
    throw new HomepageMessageInputError("empty_content");
  }

  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const clientIp = input.clientIp?.trim() || "unknown";
  const day = getHomepageMessageRateDay(now);
  const clientHash = await hashHomepageMessageClientId(clientIp);
  const rateKey = homepageMessageRateKey(day, clientHash);
  const message: HomepageMessageRecord = {
    id: crypto.randomUUID(),
    content,
    createdAt,
  };

  const kv = await getKv();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const currentRate = await kv.get<HomepageMessageRateRecord>(rateKey);
    const count = currentRate.value?.count ?? 0;
    if (count >= MESSAGE_DAILY_IP_LIMIT) {
      throw new HomepageMessageRateLimitError();
    }

    const nextRate: HomepageMessageRateRecord = {
      count: count + 1,
      day,
      updatedAt: createdAt,
    };
    const result = await kv.atomic()
      .check({ key: rateKey, versionstamp: currentRate.versionstamp })
      .set(rateKey, nextRate, { expireIn: MESSAGE_RATE_TTL_MS })
      .set(homepageMessageKey(message), message)
      .commit();

    if (result.ok) {
      return message;
    }
  }

  throw new Error("message_rate_conflict");
};
