import { defineEventHandler } from "h3";

import {
  getDownipStore,
  handleDownipUpdateRequest,
} from "../../../../domains/downip/server/handlers.ts";

export default defineEventHandler(async () => {
  return await handleDownipUpdateRequest(
    new Request("http://openfx.local/update", { method: "GET" }),
    await getDownipStore(),
  );
});
