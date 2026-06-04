import { defineEventHandler } from "h3";

import {
  getDownipStore,
  handleDownipUpdateRequest,
} from "../../../../domains/downip/server/handlers.ts";
import { requireProjectAccess } from "../utils/access.ts";
import { createWebRequest } from "../utils/request.ts";

export const handleProtectedDownipMappingRequest = async (
  req: Request,
): Promise<Response> => {
  const denied = await requireProjectAccess(req, "ipv6-sync-suite");
  if (denied) return denied;

  return await handleDownipUpdateRequest(req, await getDownipStore());
};

export default defineEventHandler(async (event) => {
  return await handleProtectedDownipMappingRequest(
    await createWebRequest(event, "GET"),
  );
});
