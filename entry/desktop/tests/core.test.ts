import { assertEquals } from "@std/assert";

import { AGENT_TOOLS } from "../src/core/agent-tools.ts";
import {
  createTelemetryAccumulator,
  sanitizeDesktopPreferences,
} from "../src/core/desktop-state.ts";
import { parseSystemCommandOutputs } from "../src/core/system-parsers.ts";

Deno.test("Agent registry is exact, closed, and marks every effectful tool for approval", () => {
  assertEquals(
    AGENT_TOOLS.map(({ id, requiresApproval, readonly }) => ({
      id,
      requiresApproval,
      readonly,
    })),
    [
      { id: "system.getOverview", requiresApproval: false, readonly: true },
      { id: "process.list", requiresApproval: false, readonly: true },
      { id: "network.getStatus", requiresApproval: false, readonly: true },
      { id: "relay.getStatus", requiresApproval: false, readonly: true },
      { id: "audit.list", requiresApproval: false, readonly: true },
      { id: "process.kill", requiresApproval: true, readonly: false },
      { id: "app.open", requiresApproval: true, readonly: false },
      { id: "relay.update", requiresApproval: true, readonly: false },
    ],
  );
});

Deno.test("macOS command output becomes a system overview, process list, and public IPv6 state", () => {
  const parsed = parseSystemCommandOutputs({
    top: "CPU usage: 12.5% user, 7.5% sys, 80.0% idle",
    memsize: "17179869184\n",
    vmStat: "Mach Virtual Memory Statistics: (page size of 16384 bytes)\n" +
      "Pages active: 1000.\nPages wired down: 500.\n" +
      "Pages occupied by compressor: 250.\n",
    df:
      "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk 1000000 250000 750000 25% /\n",
    netstat: "Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll\n" +
      "en0 1500 link aa 1 0 1048576 1 0 2097152 0\n" +
      "lo0 16384 link lo 1 0 999 1 0 999 0\n",
    battery:
      "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1) 77%; discharging",
    processes: "101 12.5 4.2 /Applications/Test App.app/Contents/MacOS/Test App\n" +
      "202 1.0 0.5 /usr/bin/helper\n",
    ifconfig: "en0: flags=8863<UP>\n\tinet6 fe80::1%en0 prefixlen 64\n" +
      "\tinet6 240e:1234:5678::9 prefixlen 64 autoconf\n",
  }, 1_700_000_000_000);

  assertEquals(parsed.overview.cpuUsagePercent, 20);
  assertEquals(parsed.overview.memoryTotalBytes, 17_179_869_184);
  assertEquals(parsed.overview.memoryUsedBytes, 28_672_000);
  assertEquals(parsed.overview.diskUsedBytes, 256_000_000);
  assertEquals(parsed.overview.networkRxBytes, 1_048_576);
  assertEquals(parsed.overview.networkTxBytes, 2_097_152);
  assertEquals(parsed.overview.batteryPercent, 77);
  assertEquals(parsed.processes[0]?.pid, 101);
  assertEquals(
    parsed.processes[0]?.command,
    "/Applications/Test App.app/Contents/MacOS/Test App",
  );
  assertEquals(parsed.network.publicIpv6, "240e:1234:5678::9");
});

Deno.test("ordinary preferences discard secrets and normalize pairing state", () => {
  assertEquals(
    sanitizeDesktopPreferences({
      serverUrl: " https://openfx.example/path/ ",
      nodeId: " node-1 ",
      nodeName: " Studio Mac ",
      relayEnabled: true,
      nodeSecret: "must-not-survive",
    }),
    {
      serverUrl: "https://openfx.example",
      nodeId: "node-1",
      nodeName: "Studio Mac",
      relayEnabled: true,
      pairedAt: null,
    },
  );
});

Deno.test("five-second telemetry samples aggregate into local minute summaries", () => {
  const telemetry = createTelemetryAccumulator();
  telemetry.add({
    collectedAt: 60_000,
    cpuUsagePercent: 10,
    memoryUsedBytes: 10,
    memoryTotalBytes: 100,
    diskUsedBytes: 20,
    diskTotalBytes: 200,
    networkRxBytes: 1_000,
    networkTxBytes: 2_000,
    batteryPercent: 80,
    processCount: 10,
  });
  telemetry.add({
    collectedAt: 65_000,
    cpuUsagePercent: 30,
    memoryUsedBytes: 30,
    memoryTotalBytes: 100,
    diskUsedBytes: 40,
    diskTotalBytes: 200,
    networkRxBytes: 1_500,
    networkTxBytes: 2_750,
    batteryPercent: null,
    processCount: 14,
  });

  assertEquals(telemetry.minutes(), [{
    minuteStart: 60_000,
    sampleCount: 2,
    cpuUsagePercent: 20,
    memoryUsedBytes: 20,
    memoryTotalBytes: 100,
    diskUsedBytes: 30,
    diskTotalBytes: 200,
    networkRxBytes: 500,
    networkTxBytes: 750,
    batteryPercent: 80,
    processCount: 12,
  }]);
});
