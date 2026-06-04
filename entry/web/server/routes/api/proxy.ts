import { defineEventHandler } from "h3";

import { proxyRequest } from "../../../../../domains/proxy/server/handler.ts";
import { requireProjectAccess } from "../../utils/access.ts";
import { createWebRequest } from "../../utils/request.ts";

export const handleRootProxyRequest = async (req: Request): Promise<Response> => {
  try {
    if (req.method !== "OPTIONS") {
      const denied = await requireProjectAccess(req, "relay-proxy-gateway");
      if (denied) return denied;
    }

    return await proxyRequest(req);
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, {
      status: 502,
      headers: { "access-control-allow-origin": "*" },
    });
  }
};

export default defineEventHandler(async (event) => {
  return await handleRootProxyRequest(
    await createWebRequest(event, event.method),
  );
});
