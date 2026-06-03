import { defineEventHandler } from "h3";

import {
  getUnlockRule,
  isAdminUnlockKey,
  isUnlockRuleExpired,
} from "../../admin/unlocks.ts";
import { createWebRequest } from "../../utils/request.ts";

export const unlockHandler = async (req: Request): Promise<Response> => {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const key = typeof (body as Record<string, unknown>)?.key === "string"
    ? (body as Record<string, string>).key.trim()
    : "";

  if (!key) {
    return Response.json({ ok: false, error: "missing_key" }, { status: 400 });
  }

  if (isAdminUnlockKey(key)) {
    return Response.json({ ok: true, mode: "admin", redirect: "/admin" });
  }

  const rule = await getUnlockRule(key);
  if (!rule || isUnlockRuleExpired(rule)) {
    return Response.json({ ok: false, error: "invalid_key" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    mode: "projects",
    key: rule.key,
    label: rule.label,
    expiresAt: rule.expiresAt,
    projectIds: rule.projectIds,
  });
};

export default defineEventHandler(async (event) => {
  return await unlockHandler(await createWebRequest(event, "POST"));
});
