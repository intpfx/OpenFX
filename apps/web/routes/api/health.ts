import { define } from "@/utils.ts";

import { createRuntimeHealth } from "../../../../packages/core/src/mod.ts";

export const handlers = define.handlers({
  GET() {
    return Response.json(createRuntimeHealth({ surface: "web", version: "0.1.0" }));
  },
});
