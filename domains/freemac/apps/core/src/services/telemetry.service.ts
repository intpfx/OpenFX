import type { SystemSnapshot } from "@freemac/shared";
import { loadLatestTelemetrySnapshot, saveTelemetrySnapshot } from "../db/client";
import { logger } from "../lib/logger";
import { runCommand } from "../lib/command";

let snapshot: SystemSnapshot = {
  collectedAt: new Date().toISOString(),
  cpuUsagePercent: 0,
  memoryUsedMb: 0,
  memoryTotalMb: 0,
  diskUsedGb: 0,
  diskTotalGb: 0,
  networkRxMb: 0,
  networkTxMb: 0,
  batteryPercent: null,
  processCount: 0,
  topProcesses: [],
};
let hydrated = false;

function hydrateSnapshot(): void {
  if (hydrated) {
    return;
  }

  const saved = loadLatestTelemetrySnapshot();
  if (saved) {
    snapshot = saved;
  }
  hydrated = true;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseCpuUsage(output: string): number {
  const match = output.match(/CPU usage:\s+[\d.]+% user,\s+[\d.]+% sys,\s+([\d.]+)% idle/i);
  if (!match) {
    return 0;
  }
  return round(100 - Number(match[1] || 0));
}

function parseMemoryUsage(
  vmStatOutput: string,
  totalMemoryBytes: number,
): { usedMb: number; totalMb: number } {
  const pageSizeMatch = vmStatOutput.match(/page size of (\d+) bytes/i);
  const pageSize = Number(pageSizeMatch?.[1] || 4096);
  const lines = vmStatOutput.split("\n");
  const pageCounts: Record<string, number> = {};

  for (const line of lines) {
    const match = line.match(/^Pages\s+(.+?):\s+([\d.]+)\./);
    if (!match) {
      continue;
    }
    pageCounts[match[1]!.toLowerCase()] = Number(match[2] || 0);
  }

  const usedPages =
    (pageCounts["active"] || 0) +
    (pageCounts["wired down"] || 0) +
    (pageCounts["occupied by compressor"] || 0);

  return {
    usedMb: round((usedPages * pageSize) / 1024 / 1024),
    totalMb: round(totalMemoryBytes / 1024 / 1024),
  };
}

function parseDiskUsage(dfOutput: string): { usedGb: number; totalGb: number } {
  const lines = dfOutput.trim().split("\n");
  const dataLine = lines[lines.length - 1] || "";
  const parts = dataLine.trim().split(/\s+/);
  const totalKb = Number(parts[1] || 0);
  const usedKb = Number(parts[2] || 0);
  return {
    usedGb: round(usedKb / 1024 / 1024),
    totalGb: round(totalKb / 1024 / 1024),
  };
}

function parseBatteryPercent(output: string): number | null {
  const match = output.match(/(\d+)%/);
  return match ? Number(match[1]) : null;
}

function parseTopProcesses(output: string): SystemSnapshot["topProcesses"] {
  return output
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/);
      if (!match) {
        return null;
      }
      return {
        pid: Number(match[1]),
        cpu: Number(match[2]),
        memory: Number(match[3]),
        command: match[4]!.trim(),
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .sort((left, right) => right.cpu - left.cpu)
    .slice(0, 5);
}

function parseNetworkTotals(output: string): { rxMb: number; txMb: number } {
  const lines = output.trim().split("\n");
  const header = lines.find(
    (line) => line.includes("Name") && line.includes("Ibytes") && line.includes("Obytes"),
  );
  if (!header) {
    return { rxMb: 0, txMb: 0 };
  }

  const headers = header.trim().split(/\s+/);
  const nameIndex = headers.indexOf("Name");
  const ibytesIndex = headers.indexOf("Ibytes");
  const obytesIndex = headers.indexOf("Obytes");
  if (nameIndex === -1 || ibytesIndex === -1 || obytesIndex === -1) {
    return { rxMb: 0, txMb: 0 };
  }

  const totals = new Map<string, { rx: number; tx: number }>();
  for (const line of lines.slice(lines.indexOf(header) + 1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length <= obytesIndex) {
      continue;
    }

    const name = parts[nameIndex]!;
    if (name.startsWith("lo")) {
      continue;
    }

    const rx = Number(parts[ibytesIndex] || 0);
    const tx = Number(parts[obytesIndex] || 0);
    const current = totals.get(name);
    if (!current || rx > current.rx || tx > current.tx) {
      totals.set(name, { rx, tx });
    }
  }

  let totalRx = 0;
  let totalTx = 0;
  for (const value of totals.values()) {
    totalRx += value.rx;
    totalTx += value.tx;
  }

  return {
    rxMb: round(totalRx / 1024 / 1024),
    txMb: round(totalTx / 1024 / 1024),
  };
}

export function getSystemSnapshot(): SystemSnapshot {
  hydrateSnapshot();
  return snapshot;
}

export async function collectSystemSnapshot(): Promise<SystemSnapshot> {
  hydrateSnapshot();
  try {
    const [topResult, memSizeResult, vmStatResult, dfResult, netstatResult, pmsetResult, psResult] =
      await Promise.all([
        runCommand(["/usr/bin/top", "-l", "1", "-n", "0"]),
        runCommand(["/usr/sbin/sysctl", "-n", "hw.memsize"]),
        runCommand(["/usr/bin/vm_stat"]),
        runCommand(["/bin/df", "-k", "/"]),
        runCommand(["/usr/sbin/netstat", "-ibn"]),
        runCommand(["/usr/bin/pmset", "-g", "batt"]),
        runCommand(["/bin/ps", "-Ao", "pid=,pcpu=,pmem=,comm="]),
      ]);

    const totalMemoryBytes = Number(memSizeResult.stdout.trim() || 0);
    const cpuUsagePercent = parseCpuUsage(topResult.stdout);
    const memory = parseMemoryUsage(vmStatResult.stdout, totalMemoryBytes);
    const disk = parseDiskUsage(dfResult.stdout);
    const network = parseNetworkTotals(netstatResult.stdout);
    const batteryPercent = parseBatteryPercent(pmsetResult.stdout);
    const topProcesses = parseTopProcesses(psResult.stdout);
    const processCount = psResult.stdout.trim().split("\n").filter(Boolean).length;

    snapshot = {
      collectedAt: new Date().toISOString(),
      cpuUsagePercent,
      memoryUsedMb: memory.usedMb,
      memoryTotalMb: memory.totalMb,
      diskUsedGb: disk.usedGb,
      diskTotalGb: disk.totalGb,
      networkRxMb: network.rxMb,
      networkTxMb: network.txMb,
      batteryPercent,
      processCount,
      topProcesses,
    };
    saveTelemetrySnapshot(snapshot);
    return snapshot;
  } catch (error) {
    logger.error("telemetry", "Failed to collect telemetry snapshot", {
      error: error instanceof Error ? error.message : String(error),
    });
    snapshot = {
      ...snapshot,
      collectedAt: new Date().toISOString(),
    };
    return snapshot;
  }
}
