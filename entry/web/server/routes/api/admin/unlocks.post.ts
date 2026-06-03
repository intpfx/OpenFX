import { defineEventHandler } from "h3";

import {
  generateUniqueUnlockKey,
  getAdminUnlockKey,
  saveUnlockRule,
  type UnlockRule,
  validateUnlockRule,
} from "../../../admin/unlocks.ts";
import { createWebRequest } from "../../../utils/request.ts";

const isAuthorized = (req: Request): boolean => {
  const configured = getAdminUnlockKey();
  const provided = (req.headers.get("x-openfx-admin-key") ?? "").trim();
  return !!configured && provided === configured;
};

export const saveAdminUnlockRuleHandler = async (req: Request): Promise<Response> => {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const input = body as Partial<UnlockRule>;
  const rawExpiresAt = String(input.expiresAt ?? "").trim();
  const parsedExpiresAt = Date.parse(rawExpiresAt);
  const normalized: UnlockRule = {
    key: await generateUniqueUnlockKey(),
    label: String(input.label ?? "").trim(),
    projectIds: Array.isArray(input.projectIds)
      ? input.projectIds.map((value) => String(value))
      : [],
    expiresAt: Number.isNaN(parsedExpiresAt)
      ? rawExpiresAt
      : new Date(parsedExpiresAt).toISOString(),
  };

  const error = validateUnlockRule(normalized);
  if (error) {
    return Response.json({ ok: false, error }, { status: 400 });
  }

  await saveUnlockRule(normalized);
  return Response.json({ ok: true, rule: normalized });
};

export default defineEventHandler(async (event) => {
  return await saveAdminUnlockRuleHandler(await createWebRequest(event, "POST"));
});
