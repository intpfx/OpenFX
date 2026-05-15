import { expect } from "@std/expect";
import { App } from "fresh";

import { handlers } from "../routes/api/health.ts";

Deno.test("GET /api/health returns runtime metadata", async () => {
  const app = new App().get("/api/health", handlers.GET).handler();

  const response = await app(new Request("http://localhost/api/health"));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.status).toBe("ok");
  expect(body.surface).toBe("web");
});
