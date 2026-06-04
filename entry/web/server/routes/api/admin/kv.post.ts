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

const isJsonKvKey = (value: unknown): value is JsonKvKeyPart[] => {
  return Array.isArray(value) && value.length > 0 &&
    value.every((part) =>
      typeof part === "string" || typeof part === "number" ||
      typeof part === "boolean"
    );
};

export const saveAdminKvHandler = async (req: Request): Promise<Response> => {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const input = body as { key?: unknown; value?: unknown };
  if (!isJsonKvKey(input.key)) {
    return Response.json({ ok: false, error: "invalid_key" }, { status: 400 });
  }

  try {
    const kv = await getKv();
    await kv.set(input.key, input.value ?? null);
    return Response.json({ ok: true, key: input.key });
  } catch {
    return Response.json({ ok: false, error: "kv_unavailable" }, { status: 503 });
  }
};

export default defineEventHandler(async (event) => {
  return await saveAdminKvHandler(await createWebRequest(event, "POST"));
});
