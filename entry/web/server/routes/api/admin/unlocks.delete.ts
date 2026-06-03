import { defineEventHandler } from "h3";

import { deleteUnlockRule, getAdminUnlockKey } from "../../../admin/unlocks.ts";
import { createWebRequest } from "../../../utils/request.ts";

const isAuthorized = (req: Request): boolean => {
  const configured = getAdminUnlockKey();
  const provided = (req.headers.get("x-openfx-admin-key") ?? "").trim();
  return !!configured && provided === configured;
};

export const deleteAdminUnlockRuleHandler = async (req: Request): Promise<Response> => {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key")?.trim() ?? "";
  if (!key) {
    return Response.json({ ok: false, error: "missing_key" }, { status: 400 });
  }

  await deleteUnlockRule(key);
  return Response.json({ ok: true, deleted: key });
};

export default defineEventHandler(async (event) => {
  return await deleteAdminUnlockRuleHandler(await createWebRequest(event));
});
