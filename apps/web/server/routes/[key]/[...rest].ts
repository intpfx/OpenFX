import { defineEventHandler, getRouterParam } from "h3";

import { getDownipStore, handleDownipRedirectRequest } from "@/utils/downip.ts";

export default defineEventHandler(async (event) => {
  return await handleDownipRedirectRequest(
    new Request(`http://openfx.local${event.path}`, { method: event.method }),
    {
      key: getRouterParam(event, "key") ?? "",
      rest: getRouterParam(event, "rest") ?? undefined,
    },
    await getDownipStore(),
  );
});
