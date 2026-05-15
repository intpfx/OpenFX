import { define } from "@/utils.ts";
import { getDownipStore, handleDownipRedirectRequest } from "@/utils/downip.ts";

export const handlers = define.handlers({
  async GET(ctx) {
    return await handleDownipRedirectRequest(ctx.req, {
      key: ctx.params.key,
      rest: ctx.params.rest,
    }, await getDownipStore());
  },
  async HEAD(ctx) {
    return await handleDownipRedirectRequest(ctx.req, {
      key: ctx.params.key,
      rest: ctx.params.rest,
    }, await getDownipStore());
  },
  async OPTIONS(ctx) {
    return await handleDownipRedirectRequest(ctx.req, {
      key: ctx.params.key,
      rest: ctx.params.rest,
    }, await getDownipStore());
  },
});
