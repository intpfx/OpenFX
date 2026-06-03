import { normalizeIpv6 } from "../core/validation.ts";
import { getEnvString } from "./store.ts";

export const getRedirectConfig = (): { scheme: string; port?: string } => {
  const scheme = getEnvString("DOWNIP_REDIRECT_SCHEME") || "http";
  const port = getEnvString("DOWNIP_REDIRECT_PORT") || undefined;
  return { scheme, port };
};

export const buildRedirectUrl = (
  ipv6: string,
  restPath: string,
  search: string,
  cfg: { scheme: string; port?: string },
): string => {
  const host = `[${normalizeIpv6(ipv6)}]`;
  const portPart = cfg.port ? `:${cfg.port}` : "";
  const path = restPath.startsWith("/") ? restPath : `/${restPath}`;
  return `${cfg.scheme}://${host}${portPart}${path}${search}`;
};
