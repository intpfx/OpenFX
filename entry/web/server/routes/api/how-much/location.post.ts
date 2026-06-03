import { defineEventHandler, readBody } from "h3";

import { reverseGeocode } from "../../../../../../domains/how-much/server/geocode.ts";

export default defineEventHandler(async (event) => {
  const { lat, lng } = await readBody(event) as { lat?: number; lng?: number };

  if (typeof lat !== "number" || typeof lng !== "number") {
    return ["未知地区"];
  }

  return await reverseGeocode(lat, lng);
});
