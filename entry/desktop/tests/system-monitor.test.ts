import { assertEquals } from "jsr:@std/assert@^1.0.19";

import type { ParsedSystemState } from "../src/core/types.ts";
import { createSystemMonitor } from "../src/native/system-monitor.ts";

Deno.test("system monitor starts with one sample and only repeats on demand", async () => {
  let collections = 0;
  const monitor = createSystemMonitor({
    collector: {
      collect(callback) {
        collections += 1;
        callback(null, systemState(collections));
      },
    },
  });

  monitor.start();
  monitor.start();
  assertEquals(collections, 1, "repeated start must not create a polling loop");

  const refreshed = await monitor.sampleNow();
  assertEquals(collections, 2);
  assertEquals(refreshed?.overview.collectedAt, 2);

  monitor.stop();
  monitor.start();
  assertEquals(collections, 3, "an explicit lifecycle restart gets one fresh sample");
});

const systemState = (collectedAt: number): ParsedSystemState => ({
  overview: {
    collectedAt,
    cpuUsagePercent: 1,
    memoryUsedBytes: 2,
    memoryTotalBytes: 3,
    diskUsedBytes: 4,
    diskTotalBytes: 5,
    networkRxBytes: 6,
    networkTxBytes: 7,
    batteryPercent: 80,
    processCount: 1,
    topProcesses: [],
  },
  processes: [],
  network: {
    publicIpv6: null,
    ipv6Addresses: [],
    collectedAt,
  },
});
