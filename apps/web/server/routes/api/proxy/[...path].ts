import { defineEventHandler, getRouterParam } from "h3";

import { proxyRequest } from "@/utils/proxy.ts";
import { createWebRequest } from "../../../utils/request.ts";

const handleProxyRequest = async (req: Request, path?: string): Promise<Response> => {
  try {
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
