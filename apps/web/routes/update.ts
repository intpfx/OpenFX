import { define } from "@/utils.ts";
import { getDownipStore, handleDownipUpdateRequest } from "@/utils/downip.ts";

export const handlers = define.handlers({
  async GET(_ctx) {
    return await handleDownipUpdateRequest(new Request(_ctx.req.url, { method: "GET" }), await getDownipStore());
  },
  async POST(ctx) {
    return await handleDownipUpdateRequest(ctx.req, await getDownipStore());
  },
  async OPTIONS(ctx) {
    return await handleDownipUpdateRequest(ctx.req, await getDownipStore());
  },
});
