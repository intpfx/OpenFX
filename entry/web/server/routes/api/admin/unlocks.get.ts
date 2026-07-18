import { defineEventHandler } from "h3";

import { listUnlockRules } from "../../../admin/unlocks.ts";
import { requireAdminSession } from "../../../console/admin.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const listAdminUnlockRulesHandler = async (req: Request): Promise<Response> => {
  const denied = await requireAdminSession(req);
  if (denied) return denied;

  return Response.json({ ok: true, rules: await listUnlockRules() });
};

export default defineEventHandler(async (event) => {
  return await listAdminUnlockRulesHandler(await createWebRequest(event));
});
