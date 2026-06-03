import type { DownipSyncConfig } from "./types.ts";

export const stripZoneIndex = (address: string): string => {
  const index = address.indexOf("%");
  return index >= 0 ? address.slice(0, index) : address;
};

export const normalizeIpv6 = (address: string): string =>
  stripZoneIndex(address.trim()).toLowerCase();

export const isLoopbackIpv6 = (address: string): boolean =>
  normalizeIpv6(address) === "::1";

export const isLinkLocalIpv6 = (address: string): boolean =>
  normalizeIpv6(address).startsWith("fe80:");

export const isUniqueLocalIpv6 = (address: string): boolean => {
  const normalized = normalizeIpv6(address);
  return normalized.startsWith("fc") || normalized.startsWith("fd");
};

export const isGlobalUnicastIpv6 = (address: string): boolean => {
  const normalized = normalizeIpv6(address);
  const first = normalized.split(":")[0] ?? "";

  if (!first) {
    return false;
  }

  const value = Number.parseInt(first, 16);
  return Number.isFinite(value) && (value & 0xe000) === 0x2000;
};

export const isProbablyIpv6 = (address: string): boolean => {
  const normalized = normalizeIpv6(address);
  return normalized.includes(":") && /^[0-9a-f:.]+$/.test(normalized);
};

export const uniqueStrings = (items: readonly string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      output.push(item);
    }
  }

  return output;
};

export const pickPreferredIpv6 = (list: readonly string[]): string | null => {
  const score = (value: string): number => {
    if (isGlobalUnicastIpv6(value)) {
      return 0;
    }

    if (isUniqueLocalIpv6(value)) {
      return 1;
    }

    if (isLinkLocalIpv6(value)) {
      return 3;
    }

    return 2;
  };

  const sorted = [...list].sort((left, right) => score(left) - score(right));
  return sorted[0] ?? null;
};

export const isValidEndpointKey = (key: string): boolean => {
  if (!key) {
    return false;
  }

  if (key.toLowerCase() === "update") {
    return false;
  }

  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(key);
};

export const parsePortOrNull = (value: string): number | null => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const port = Math.floor(parsed);
  return port >= 1 && port <= 65535 ? port : null;
};

export const parsePositiveIntegerOrNull = (value: string): number | null => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const integer = Math.floor(parsed);
  return integer > 0 ? integer : null;
};

export const normalizeServerBaseUrl = (input: string): string => {
  const trimmed = input.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return trimmed;
  }
};

export const isValidServerUrl = (input: string): boolean => {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const computeUpdateUrl = (baseOrUpdateUrl: string): string => {
  const normalized = normalizeServerBaseUrl(baseOrUpdateUrl);

  try {
    const url = new URL(normalized);
    const pathname = url.pathname.toLowerCase();

    if (pathname.endsWith("/update") || pathname === "update") {
      return url.toString();
    }

    url.pathname = `${url.pathname || ""}/update`.replace(/\/\/+/, "/");
    return url.toString();
  } catch {
    return normalized.endsWith("/update")
      ? normalized
      : `${normalized.replace(/\/+$/, "")}/update`;
  }
};

export const buildIpv6ReportPayload = (
  endpointKey: string,
  ipv6: string,
  endpointPort: number,
): Record<string, { ipv6: string; port: number }> => ({
  [endpointKey]: {
    ipv6: normalizeIpv6(ipv6),
    port: endpointPort,
  },
});

export const validateDownipSyncConfig = (
  config: DownipSyncConfig,
): string | null => {
  const serverBaseUrl = normalizeServerBaseUrl(config.serverBaseUrl);

  if (!serverBaseUrl || !isValidServerUrl(serverBaseUrl)) {
    return "请输入有效的服务端 URL（http/https）";
  }

  if (!isValidEndpointKey(config.endpointKey.trim())) {
    return "请输入有效的 endpoint key（不能是 update，只允许字母数字与 ._-）";
  }

  if (config.endpointPort < 1 || config.endpointPort > 65535) {
    return "请输入有效的目标端口（1-65535）";
  }

  if (!config.ipv6.trim() || !isProbablyIpv6(config.ipv6)) {
    return "请输入有效的 IPv6 地址";
  }

  return null;
};

export type { DownipSyncConfig };
