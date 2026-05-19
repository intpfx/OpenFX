import { defineEventHandler } from "h3";

import { getDownipStore, handleDownipUpdateRequest } from "@/utils/downip.ts";

export default defineEventHandler(async () => {
  return await handleDownipUpdateRequest(
    new Request("http://openfx.local/update", { method: "OPTIONS" }),
    await getDownipStore(),
  );
});
