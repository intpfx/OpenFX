import { defineEventHandler } from "h3";

import { getAdminUnlockKey } from "../../../admin/unlocks.ts";
import { createWebRequest } from "../../../utils/request.ts";

const isAuthorized = (req: Request): boolean => {
  const configured = getAdminUnlockKey();
  const provided = (req.headers.get("x-openfx-admin-key") ?? "").trim();
  return !!configured && provided === configured;
};

export const checkAdminAccessHandler = (req: Request): Response => {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  return Response.json({ ok: true });
};

export default defineEventHandler(async (event) => {
  return checkAdminAccessHandler(await createWebRequest(event));
});
