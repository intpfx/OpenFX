import { Elysia } from "elysia";
import { getDdnsState, runDdnsSync } from "../services/ddns.service";
import { hasSession } from "../services/auth.service";
import { getRelayReportState, reportRelayTarget } from "../services/relay-report.service";
import { collectSystemSnapshot, getSystemSnapshot } from "../services/telemetry.service";
import { getSetupStatus } from "../services/settings.service";

export const systemRoutes = new Elysia({ prefix: "/system" })
  .get("/health", () => ({ ok: true, service: "freemac-core" }))
  .get("/overview", async () => ({
    setup: await getSetupStatus(),
    ddns: getDdnsState(),
    relay: getRelayReportState(),
    snapshot: getSystemSnapshot(),
  }))
  .post("/refresh", async () => ({
    ddns: await runDdnsSync(),
    relay: await reportRelayTarget(),
    snapshot: await collectSystemSnapshot(),
  }))
  .post("/report-relay", async ({ headers }) => {
    if (!hasSession(headers["x-session-id"])) {
      return { ok: false, message: "Unauthorized" };
    }

    try {
      return {
        ok: true,
        relay: await reportRelayTarget(),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Relay report failed.",
      };
    }
  });
