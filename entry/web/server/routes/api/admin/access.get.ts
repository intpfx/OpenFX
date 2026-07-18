import { defineEventHandler } from "h3";

import { requireAdminSession } from "../../../console/admin.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const checkAdminAccessHandler = async (req: Request): Promise<Response> => {
  const denied = await requireAdminSession(req);
  if (denied) return denied;

  return Response.json({ ok: true });
};

export default defineEventHandler(async (event) => {
  return await checkAdminAccessHandler(await createWebRequest(event));
});
