import { defineEventHandler, getRouterParam } from "h3";

import { handleMediaPlayerRequest } from "../../media-player.ts";

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, "key") ?? "";
  const rest = getRouterParam(event, "rest") ?? "";

  if (key === "media-player") {
    return await handleMediaPlayerRequest(event.method, rest);
  }

  return new Response("Not Found", { status: 404 });
});
