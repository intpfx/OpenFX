import { createApp } from "./app";
import { config } from "./config";
import { initDb } from "./db/client";
import { logger } from "./lib/logger";
import { registerIntervalTask, stopAllTasks } from "./services/task-scheduler.service";
import { runDdnsSync } from "./services/ddns.service";
import { reportRelayTarget } from "./services/relay-report.service";
import { hydrateRuntimeSettings } from "./services/settings.service";
import { collectSystemSnapshot } from "./services/telemetry.service";

function formatListenHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

initDb();

await hydrateRuntimeSettings();

await runDdnsSync();
await collectSystemSnapshot();
await reportRelayTarget();

registerIntervalTask("ddns", config.ddnsIntervalMs, () => runDdnsSync());
registerIntervalTask("telemetry", config.telemetryIntervalMs, () => collectSystemSnapshot());
registerIntervalTask("relay-report", config.relayReportIntervalMs, () => reportRelayTarget());

const app = createApp();
const server = app.listen({
  hostname: config.host,
  port: config.port,
});

logger.info(
  "core",
  `freemac core listening on http://${formatListenHost(config.host)}:${config.port}`,
);

process.on("SIGINT", () => {
  stopAllTasks();
  server.stop();
  process.exit(0);
});
