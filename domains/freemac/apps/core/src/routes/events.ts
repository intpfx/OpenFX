import { Elysia } from "elysia";
import { config } from "../config";
import { getDdnsState } from "../services/ddns.service";
import { getRelayReportState } from "../services/relay-report.service";
import { getSetupStatus } from "../services/settings.service";
import { getSystemSnapshot } from "../services/telemetry.service";

export const eventsRoutes = new Elysia({ prefix: "/events" }).get("/stream", ({ request }) => {
  return new Response(
    new ReadableStream({
      start(controller) {
        let closed = false;

        const cleanup = () => {
          if (closed) {
            return;
          }
          closed = true;
          clearInterval(interval);
          try {
            controller.close();
          } catch {
            return;
          }
        };

        const send = async () => {
          if (closed) {
            return;
          }

          try {
            controller.enqueue(
              `data: ${JSON.stringify({ setup: await getSetupStatus(), ddns: getDdnsState(), relay: getRelayReportState(), snapshot: getSystemSnapshot() })}\n\n`,
            );
          } catch {
            cleanup();
          }
        };

        void send();
        const interval = setInterval(() => {
          void send();
        }, config.sseHeartbeatMs);

        request.signal.addEventListener("abort", cleanup, { once: true });
      },
      cancel() {
        return;
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
});
