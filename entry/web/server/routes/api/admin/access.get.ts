import { defineEventHandler } from "h3";

import { requireAdminSession } from "../../../console/admin.ts";
import {
  type ConsoleControlPlane,
  getConsoleControlPlane,
} from "../../../console/control-plane.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const checkAdminAccessHandler = async (
  req: Request,
  plane: ConsoleControlPlane = getConsoleControlPlane(),
): Promise<Response> => {
  const denied = await requireAdminSession(req, plane);
  if (denied) return denied;

  return Response.json({ ok: true });
};

export default defineEventHandler(async (event) => {
  return await checkAdminAccessHandler(await createWebRequest(event));
});
