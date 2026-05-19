import { defineEventHandler } from "h3";

import { createRuntimeHealth } from "../../../../../packages/core/src/mod.ts";

export const healthHandler = () => {
  return createRuntimeHealth({ surface: "web", version: "0.1.0" });
};

export default defineEventHandler(() => {
  return healthHandler();
});
