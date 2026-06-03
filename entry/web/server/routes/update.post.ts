import { defineEventHandler } from "h3";

import {
  getDownipStore,
  handleDownipUpdateRequest,
} from "../../../../domains/downip/server/handlers.ts";
import { createWebRequest } from "../utils/request.ts";

export default defineEventHandler(async (event) => {
  return await handleDownipUpdateRequest(
    await createWebRequest(event, "POST"),
    await getDownipStore(),
  );
});
