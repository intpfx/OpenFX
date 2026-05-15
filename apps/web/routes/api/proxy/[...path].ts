import { define } from "@/utils.ts";
import { proxyRequest } from "@/utils/proxy.ts";

const handle = async (req: Request, path?: string): Promise<Response> => {
  try {
    return await proxyRequest(req, path);
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, {
      status: 502,
      headers: { "access-control-allow-origin": "*" },
    });
  }
};

export const handlers = define.handlers({
  async GET(ctx) {
    return await handle(ctx.req, ctx.params.path);
  },
  async POST(ctx) {
    return await handle(ctx.req, ctx.params.path);
  },
  async PUT(ctx) {
    return await handle(ctx.req, ctx.params.path);
  },
  async PATCH(ctx) {
    return await handle(ctx.req, ctx.params.path);
  },
  async DELETE(ctx) {
    return await handle(ctx.req, ctx.params.path);
  },
  async HEAD(ctx) {
    return await handle(ctx.req, ctx.params.path);
  },
  async OPTIONS(ctx) {
    return await handle(ctx.req, ctx.params.path);
  },
});
