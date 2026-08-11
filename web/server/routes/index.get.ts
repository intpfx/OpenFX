import { defineEventHandler } from "h3";

import { renderSpaDocument } from "../utils/spa.ts";

export default defineEventHandler(async () => {
  return await renderSpaDocument();
});
