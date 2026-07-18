import { assertEquals } from "@std/assert";

import {
  TELEMETRY_RETENTION_MS,
  type TelemetryMinute,
} from "../../../domains/_shared/openfx-node/mod.ts";
import { createConsoleControlPlane } from "../server/console/control-plane.ts";
import { createDenoConsoleStore } from "../server/console/store.ts";

const START = Date.parse("2026-07-18T00:00:00Z");

Deno.test({
  name: "real Deno KV keeps only seven-day telemetry while audit remains append-only",
  // The repository's default unit-test task intentionally does not enable unstable KV
  // or filesystem writes. The native integration gate runs this test explicitly with
  // --unstable-kv and the narrow read/write permissions it needs.
  ignore: typeof Deno.openKv !== "function",
  async fn() {
    const directory = await Deno.makeTempDir({
      prefix: "openfx-retention-integration-",
    });
    const kv = await Deno.openKv(`${directory}/console.sqlite`);
    try {
      let now = START;
      const store = createDenoConsoleStore(kv);
      const plane = createConsoleControlPlane({
        store,
        env: {
          OPENFX_ADMIN_KEY: "integration-admin-key",
          OPENFX_NODE_CREDENTIAL_KEY: "0123456789abcdef0123456789abcdef",
        },
        now: () => now,
      });
      const currentMinute = minute(START);
      const staleMinute = minute(START - TELEMETRY_RETENTION_MS - 60_000);
      await store.set(
        ["openfx-console", "telemetry", staleMinute.minuteStart],
        { minute: staleMinute, samples: [], receivedAt: staleMinute.minuteStart },
        { expireIn: TELEMETRY_RETENTION_MS },
      );
      await store.set(
        ["openfx-console", "telemetry", currentMinute.minuteStart],
        { minute: currentMinute, samples: [], receivedAt: START },
        { expireIn: TELEMETRY_RETENTION_MS },
      );

      const firstCookie = await login(plane);
      assertEquals(await telemetryMinuteStarts(plane, firstCookie), [START]);

      now += TELEMETRY_RETENTION_MS + 1;
      const secondCookie = await login(plane);
      assertEquals(await telemetryMinuteStarts(plane, secondCookie), []);
      const audit = await plane.console.audit(
        new Request("https://127.0.0.1/api/console/audit", {
          headers: { cookie: secondCookie },
        }),
      );
      assertEquals(audit.status, 200);
      const events = (await audit.json()).events as Array<{ action: string }>;
      assertEquals(
        events.filter((event) => event.action === "session.login").length,
        2,
      );
      const newest = await auditPage(plane, secondCookie, "?limit=1");
      assertEquals(newest.events.map((event) => event.id), ["2"]);
      assertEquals(newest.nextCursor, "2");
      const older = await auditPage(plane, secondCookie, "?limit=1&before=2");
      assertEquals(older.events.map((event) => event.id), ["1"]);
      assertEquals(older.nextCursor, null);
    } finally {
      kv.close();
      await Deno.remove(directory, { recursive: true });
    }
  },
});

async function login(
  plane: ReturnType<typeof createConsoleControlPlane>,
): Promise<string> {
  const response = await plane.adminSession.create(
    new Request("https://127.0.0.1/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "integration-admin-key" }),
    }),
  );
  assertEquals(response.status, 200);
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}

async function auditPage(
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

async function telemetryMinuteStarts(
  plane: ReturnType<typeof createConsoleControlPlane>,
  cookie: string,
): Promise<number[]> {
  const response = await plane.console.telemetry(
    new Request("https://127.0.0.1/api/console/telemetry", {
      headers: { cookie },
    }),
  );
  assertEquals(response.status, 200);
  return ((await response.json()).minutes as TelemetryMinute[]).map(
    (entry) => entry.minuteStart,
  );
}

function minute(minuteStart: number): TelemetryMinute {
  return {
    minuteStart,
    sampleCount: 1,
    cpuUsagePercent: 20,
    memoryUsedBytes: 1,
    memoryTotalBytes: 2,
    diskUsedBytes: 3,
    diskTotalBytes: 4,
    networkRxBytes: 5,
    networkTxBytes: 6,
    batteryPercent: 90,
    processCount: 7,
  };
}
