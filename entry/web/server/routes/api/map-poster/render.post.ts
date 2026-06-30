import { defineEventHandler, readBody, setResponseStatus } from "h3";

import {
  createMapPoster,
  MapPosterInputError,
  type MapPosterRenderRequest,
} from "../../../map-poster.ts";

export default defineEventHandler(async (event) => {
  let body: MapPosterRenderRequest;

  try {
    body = await readBody<MapPosterRenderRequest>(event);
  } catch {
    setResponseStatus(event, 400);
    return { ok: false, error: "invalid_json" };
  }

  try {
    return await createMapPoster(body);
  } catch (error) {
    if (error instanceof MapPosterInputError) {
      setResponseStatus(event, error.status);
      return { ok: false, error: error.code };
    }

    setResponseStatus(event, 502);
    return {
      ok: false,
      error: "map_render_failed",
    };
  }
});
