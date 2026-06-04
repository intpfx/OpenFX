import { defineEventHandler } from "h3";

import { getKv } from "../../../../../../domains/_shared/kv.ts";
import { getAdminUnlockKey } from "../../../admin/unlocks.ts";
import { createWebRequest } from "../../../utils/request.ts";

type JsonKvKeyPart = string | number | boolean;

const isAuthorized = (req: Request): boolean => {
  const configured = getAdminUnlockKey();
  const provided = (req.headers.get("x-openfx-admin-key") ?? "").trim();
  return !!configured && provided === configured;
};

const parseJsonArray = (value: string, fallback: JsonKvKeyPart[]): JsonKvKeyPart[] => {
  if (!value.trim()) return fallback;
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("expected_array");
  }

  for (const part of parsed) {
    if (
      typeof part !== "string" && typeof part !== "number" &&
      typeof part !== "boolean"
    ) {
      throw new Error("invalid_key_part");
    }
  }

  return parsed;
};

export const listAdminKvHandler = async (req: Request): Promise<Response> => {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  let prefix: JsonKvKeyPart[];
  let limit: number;
  try {
    prefix = parseJsonArray(url.searchParams.get("prefix") ?? "[]", []);
    limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 100), 1),
      500,
    );
  } catch {
    return Response.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  try {
    const kv = await getKv();
    const entries = [];
    for await (const entry of kv.list({ prefix })) {
      entries.push({
        key: entry.key,
        value: entry.value,
        versionstamp: entry.versionstamp,
      });
      if (entries.length >= limit) break;
    }

    return Response.json({ ok: true, prefix, entries, limit });
  } catch {
    return Response.json({
      ok: false,
      error: "kv_unavailable",
      hint: "当前运行时不可用 Deno KV",
    }, { status: 503 });
  }
};

export default defineEventHandler(async (event) => {
  return await listAdminKvHandler(await createWebRequest(event));
});
