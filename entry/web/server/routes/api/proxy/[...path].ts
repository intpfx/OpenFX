import { defineEventHandler, getRouterParam } from "h3";

import { proxyRequest } from "../../../../../../domains/proxy/server/handler.ts";
import { requireProjectAccess } from "../../../utils/access.ts";
import { createWebRequest } from "../../../utils/request.ts";

export const handleProxyRequest = async (
  req: Request,
  path?: string,
): Promise<Response> => {
  try {
    if (req.method !== "OPTIONS") {
      const denied = await requireProjectAccess(req, "relay-proxy-gateway");
      if (denied) return denied;
    }

    return await proxyRequest(req, path);
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, {
      status: 502,
      headers: { "access-control-allow-origin": "*" },
    });
  }
};

export default defineEventHandler(async (event) => {
  return await handleProxyRequest(
    await createWebRequest(event, event.method),
    getRouterParam(event, "path") ?? undefined,
  );
});
