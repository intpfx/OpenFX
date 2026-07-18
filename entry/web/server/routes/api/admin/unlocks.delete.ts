import { defineEventHandler } from "h3";

import { deleteUnlockRule } from "../../../admin/unlocks.ts";
import { requireAdminSession } from "../../../console/admin.ts";
import {
  type ConsoleControlPlane,
  getConsoleControlPlane,
} from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const deleteAdminUnlockRuleHandler = async (
  req: Request,
  plane: ConsoleControlPlane = getConsoleControlPlane(),
): Promise<Response> => {
  const denied = await requireAdminSession(req, plane);
  if (denied) return denied;

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
