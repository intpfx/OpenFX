import { assertEquals } from "@std/assert";

import { createConsoleControlPlane } from "../server/console/control-plane.ts";
import { createMemoryConsoleStore } from "../server/console/store.ts";

const START = Date.parse("2026-07-18T00:00:00Z");

Deno.test("audit is newest first and supports an exclusive cursor", async () => {
  let now = START;
  const plane = createConsoleControlPlane({
    store: createMemoryConsoleStore({ now: () => now }),
    env: {
      OPENFX_ADMIN_KEY: "audit-admin-key",
      OPENFX_NODE_CREDENTIAL_KEY: "0123456789abcdef0123456789abcdef",
    },
    now: () => now,
  });

  let cookie = "";
  for (let index = 0; index < 3; index++) {
    now += 1;
    cookie = await login(plane);
  }

  const first = await page(plane, cookie, "?limit=2");
  assertEquals(first.events.map((event) => event.id), ["3", "2"]);
  assertEquals(first.nextCursor, "2");

  const second = await page(plane, cookie, "?limit=2&before=2");
  assertEquals(second.events.map((event) => event.id), ["1"]);
  assertEquals(second.nextCursor, null);
});

Deno.test("audit rejects malformed cursors", async () => {
  const plane = createConsoleControlPlane({
    store: createMemoryConsoleStore(),
    env: {
      OPENFX_ADMIN_KEY: "audit-admin-key",
      OPENFX_NODE_CREDENTIAL_KEY: "0123456789abcdef0123456789abcdef",
    },
  });
  const cookie = await login(plane);
  const response = await plane.console.audit(
    new Request("https://127.0.0.1/api/console/audit?before=01", {
      headers: { cookie },
    }),
  );
  assertEquals(response.status, 400);
});

async function login(
  plane: ReturnType<typeof createConsoleControlPlane>,
): Promise<string> {
  const response = await plane.adminSession.create(
    new Request("https://127.0.0.1/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "audit-admin-key" }),
    }),
  );
  assertEquals(response.status, 200);
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}

async function page(
  plane: ReturnType<typeof createConsoleControlPlane>,
  cookie: string,
  query: string,
): Promise<{
  events: Array<{ id: string }>;
  nextCursor: string | null;
}> {
  const response = await plane.console.audit(
    new Request(`https://127.0.0.1/api/console/audit${query}`, {
      headers: { cookie },
    }),
  );
  assertEquals(response.status, 200);
  return await response.json();
}
