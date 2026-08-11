import { defineEventHandler } from "h3";

import { createRuntimeHealth } from "../../utils/health.ts";

export const healthHandler = () => {
  return createRuntimeHealth({ surface: "web", version: "0.1.0" });
};

export default defineEventHandler(() => {
  return healthHandler();
});
