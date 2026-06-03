import { expect } from "@std/expect";

import { healthHandler } from "../server/routes/api/health.get.ts";

Deno.test("GET /api/health returns runtime metadata", () => {
  const body = healthHandler();
  expect(body.status).toBe("ok");
  expect(body.surface).toBe("web");
});
