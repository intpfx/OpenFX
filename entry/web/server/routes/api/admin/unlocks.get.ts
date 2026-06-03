import { defineEventHandler } from "h3";

import { getAdminUnlockKey, listUnlockRules } from "../../../admin/unlocks.ts";
import { createWebRequest } from "../../../utils/request.ts";

const isAuthorized = (req: Request): boolean => {
  const configured = getAdminUnlockKey();
  const provided = (req.headers.get("x-openfx-admin-key") ?? "").trim();
  return !!configured && provided === configured;
};

export const listAdminUnlockRulesHandler = async (req: Request): Promise<Response> => {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  return Response.json({ ok: true, rules: await listUnlockRules() });
};

export default defineEventHandler(async (event) => {
  return await listAdminUnlockRulesHandler(await createWebRequest(event));
});
