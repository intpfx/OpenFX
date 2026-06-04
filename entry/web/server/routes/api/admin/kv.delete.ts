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

const parseJsonKey = (value: string): JsonKvKeyPart[] => {
  const parsed = JSON.parse(value) as unknown;
  if (
    !Array.isArray(parsed) || parsed.length === 0 ||
    !parsed.every((part) =>
      typeof part === "string" || typeof part === "number" ||
      typeof part === "boolean"
    )
  ) {
    throw new Error("invalid_key");
  }

  return parsed;
};

export const deleteAdminKvHandler = async (req: Request): Promise<Response> => {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  let key: JsonKvKeyPart[];
  try {
    key = parseJsonKey(url.searchParams.get("key") ?? "");
  } catch {
    return Response.json({ ok: false, error: "invalid_key" }, { status: 400 });
  }

  try {
    const kv = await getKv();
    await kv.delete(key);
    return Response.json({ ok: true, deleted: key });
  } catch {
    return Response.json({ ok: false, error: "kv_unavailable" }, { status: 503 });
  }
};

export default defineEventHandler(async (event) => {
  return await deleteAdminKvHandler(await createWebRequest(event));
});
