import type { ParsedSystemState, ProcessInfo, SystemCommandOutputs } from "./types.ts";

export const parseSystemCommandOutputs = (
  outputs: SystemCommandOutputs,
  collectedAt = Date.now(),
): ParsedSystemState => {
  const memoryTotalBytes = nonNegativeNumber(outputs.memsize.trim());
  const processes = parseProcesses(
    outputs.processes || outputs.top,
    memoryTotalBytes,
  );
  const ipv6Addresses = parseIpv6Addresses(outputs.networkState);
  return {
    overview: {
      collectedAt,
      cpuUsagePercent: parseCpu(outputs.top),
      ...parseMemory(outputs.vmStat, memoryTotalBytes),
      ...parseDisk(outputs.df),
      ...parseNetwork(outputs.netstat),
      batteryPercent: parseBattery(outputs.battery),
      processCount: parseProcessCount(outputs.top, processes.length),
      topProcesses: processes.slice(0, 10),
    },
    processes,
    network: {
      publicIpv6: ipv6Addresses.find(isPublicIpv6) ?? null,
      ipv6Addresses,
      collectedAt,
    },
  };
};

export const parseProcesses = (
  output: string,
  memoryTotalBytes = 0,
): ProcessInfo[] => {
  const lines = output.split("\n");
  let topHeaderIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^PID\s+%CPU\s+MEM\s+COMMAND\s*$/.test(lines[index]!.trim())) {
      topHeaderIndex = index;
    }
  }
  if (topHeaderIndex >= 0) {
    return lines.slice(topHeaderIndex + 1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(
          /^(\d+)\s+([\d.]+)\s+([\d.]+)([BKMGT]?)[+-]?\s+(.+)$/i,
        );
        if (!match) return null;
        const memoryBytes = Number(match[3]) * memoryUnitBytes(match[4] ?? "");
        return {
          pid: Number(match[1]),
          cpuUsagePercent: Number(match[2]),
          memoryUsagePercent: memoryTotalBytes > 0
            ? round((memoryBytes / memoryTotalBytes) * 100)
            : 0,
          command: match[5]!.trim(),
        };
      })
      .filter((process): process is ProcessInfo => process !== null)
      .sort((left, right) => right.cpuUsagePercent - left.cpuUsagePercent);
  }
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        cpuUsagePercent: Number(match[2]),
        memoryUsagePercent: Number(match[3]),
        command: match[4]!.trim(),
      };
    })
    .filter((process): process is ProcessInfo => process !== null)
    .sort((left, right) => right.cpuUsagePercent - left.cpuUsagePercent);
};

export const parseIpv6Addresses = (output: string): string[] => {
  const addresses: string[] = [];
  const matcher = /(?:\binet6\s+|\baddress\s+:\s*)([0-9a-f:]+)(?:%[\w.-]+)?\b/gi;
  for (const match of output.matchAll(matcher)) {
    const value = match[1]?.toLowerCase();
    if (
      value?.includes(":") && value !== "::1" && !addresses.includes(value)
    ) {
      addresses.push(value);
    }
  }
  return addresses;
};

export const isPublicIpv6 = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (
    !/^[0-9a-f:]+$/.test(normalized) || normalized === "::" ||
    normalized === "::1"
  ) {
    return false;
  }
  if (
    normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb") ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("ff")
  ) return false;
  const first = Number.parseInt(normalized.split(":", 1)[0] || "0", 16);
  return first >= 0x2000 && first <= 0x3fff;
};

const parseCpu = (output: string): number => {
  const samples = [...output.matchAll(/([\d.]+)%\s+idle/gi)];
  const idle = Number(samples.at(-1)?.[1] ?? 100);
  return round(Math.max(0, Math.min(100, 100 - idle)));
};

const parseProcessCount = (output: string, fallback: number): number => {
  const samples = [...output.matchAll(/Processes:\s+(\d+)\s+total/gi)];
  const latest = samples.at(-1)?.[1];
  return latest === undefined ? fallback : nonNegativeNumber(latest);
};

const memoryUnitBytes = (unit: string): number => {
  const exponent = ["", "K", "M", "G", "T"].indexOf(unit.toUpperCase());
  return exponent < 0 ? 1 : 1024 ** exponent;
};

const parseMemory = (output: string, memoryTotalBytes: number) => {
  const pageSize = Number(
    output.match(/page size of (\d+) bytes/i)?.[1] ?? 4096,
  );
  const pageCounts = new Map<string, number>();
  for (const line of output.split("\n")) {
    const match = line.match(/^Pages\s+(.+?):\s+([\d.]+)\./i);
    if (match) pageCounts.set(match[1]!.toLowerCase(), Number(match[2]));
  }
  const usedPages = (pageCounts.get("active") ?? 0) +
    (pageCounts.get("wired down") ?? 0) +
    (pageCounts.get("occupied by compressor") ?? 0);
  return {
    memoryUsedBytes: Math.round(usedPages * pageSize),
    memoryTotalBytes,
  };
};

const parseDisk = (output: string) => {
  const line = output.trim().split("\n").at(-1)?.trim() ?? "";
  const parts = line.split(/\s+/);
  return {
    diskUsedBytes: Math.round(nonNegativeNumber(parts[2]) * 1024),
    diskTotalBytes: Math.round(nonNegativeNumber(parts[1]) * 1024),
  };
};

const parseNetwork = (output: string) => {
  const lines = output.trim().split("\n");
  const headerIndex = lines.findIndex((line) =>
    line.includes("Name") && line.includes("Ibytes") && line.includes("Obytes")
  );
  if (headerIndex < 0) return { networkRxBytes: 0, networkTxBytes: 0 };
  const headers = lines[headerIndex]!.trim().split(/\s+/);
  const nameIndex = headers.indexOf("Name");
  const rxIndex = headers.indexOf("Ibytes");
  const txIndex = headers.indexOf("Obytes");
  const interfaces = new Map<string, { rx: number; tx: number }>();
  for (const line of lines.slice(headerIndex + 1)) {
    const parts = line.trim().split(/\s+/);
    const name = parts[nameIndex] ?? "";
    if (!name || name.startsWith("lo")) continue;
    const rx = nonNegativeNumber(parts[rxIndex]);
    const tx = nonNegativeNumber(parts[txIndex]);
    const current = interfaces.get(name);
    if (!current || rx > current.rx || tx > current.tx) {
      interfaces.set(name, { rx, tx });
    }
  }
  let networkRxBytes = 0;
  let networkTxBytes = 0;
  for (const value of interfaces.values()) {
    networkRxBytes += value.rx;
    networkTxBytes += value.tx;
  }
  return { networkRxBytes, networkTxBytes };
};

const parseBattery = (output: string): number | null => {
  const value = output.match(/(\d+)%/)?.[1];
  return value === undefined ? null : Math.min(100, Number(value));
};

const nonNegativeNumber = (value: string | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const round = (value: number): number => Math.round(value * 10) / 10;
