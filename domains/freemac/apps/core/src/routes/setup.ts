import { Elysia, t } from "elysia";
import { initializeSetup, getSetupStatus, updateRelaySettings } from "../services/settings.service";
import { runDdnsSync } from "../services/ddns.service";
import { hasSession } from "../services/auth.service";
import { reportRelayTarget } from "../services/relay-report.service";

export const setupRoutes = new Elysia({ prefix: "/setup" })
  .get("/status", async () => ({ ok: true, status: await getSetupStatus() }))
  .post(
    "/init",
    async ({ body }) => {
      const status = await initializeSetup(body);
      await runDdnsSync();
      return {
        ok: true,
        status,
      };
    },
    {
      body: t.Object({
        password: t.String({ minLength: 8, maxLength: 200 }),
      }),
    },
  )
  .post(
    "/relay",
    async ({ body, headers }) => {
      if (!hasSession(headers["x-session-id"])) {
        return { ok: false, message: "Unauthorized" };
      }

      try {
        const status = await updateRelaySettings(body);
        const relay = await reportRelayTarget();
        return {
          ok: true,
          status,
          relay,
          message: status.relayOrigin
            ? "Relay origin saved. Automatic reporting is active."
            : "Relay origin cleared. Automatic reporting is disabled.",
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Invalid relay origin.",
        };
      }
    },
    {
      body: t.Object({
        relayOrigin: t.String({ minLength: 0, maxLength: 500 }),
      }),
    },
  );
