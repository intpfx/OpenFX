import {
  isProbablyIpv6,
  isValidEndpointKey,
  normalizeIpv6,
} from "../core/validation.ts";
import type { DownipStore, Mapping, RouteValue } from "./store.ts";
import { buildRedirectUrl, getRedirectConfig } from "./redirect.ts";

const withCors = (headers: Headers): Headers => {
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,HEAD,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  return headers;
};

const jsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCors(
      new Headers({ "content-type": "application/json; charset=utf-8" }),
    ),
  });
};

export const emptyOptionsResponse = (): Response => {
  return new Response(null, { status: 204, headers: withCors(new Headers()) });
};

export const handleDownipUpdateRequest = async (
  req: Request,
  store: DownipStore,
): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return emptyOptionsResponse();
  }

  if (req.method === "GET") {
    const mapping = await store.list();
    return jsonResponse({ ok: true, mapping });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  let obj: unknown;
  try {
    obj = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  if (!obj || typeof obj !== "object") {
    return jsonResponse({ ok: false, error: "expected_object" }, 400);
  }

  const incoming = obj as Record<string, unknown>;
  const stored: Mapping = {};
  const rejected: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(incoming)) {
    const key = String(rawKey).trim();
    if (!isValidEndpointKey(key)) {
      rejected[key] = "invalid_key";
      continue;
    }

    if (!rawValue || typeof rawValue !== "object") {
      rejected[key] = "invalid_value";
      continue;
    }

    const value = rawValue as Record<string, unknown>;
    const ipv6 = typeof value.ipv6 === "string" ? value.ipv6.trim() : "";
    const portValue = typeof value.port === "string" ? Number(value.port) : value.port;

    if (!ipv6 || !isProbablyIpv6(ipv6)) {
      rejected[key] = "invalid_ipv6";
      continue;
    }

    if (typeof portValue !== "number" || !Number.isFinite(portValue)) {
      rejected[key] = "invalid_port";
      continue;
    }

    const port = Math.floor(portValue);
    if (port < 1 || port > 65535) {
      rejected[key] = "invalid_port";
      continue;
    }

    const routeValue: RouteValue = { ipv6: normalizeIpv6(ipv6), port };
    await store.set(key, routeValue);
    stored[key] = routeValue;
  }

  return jsonResponse({
    ok: true,
    stored,
    rejected,
    count: Object.keys(stored).length,
  });
};

export const handleDownipRedirectRequest = async (
  req: Request,
  params: { key: string; rest?: string },
  store: DownipStore,
): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return emptyOptionsResponse();
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const key = params.key.trim();
  if (!key || key.toLowerCase() === "update") {
    return jsonResponse({ ok: false, error: "not_found" }, 404);
  }

  const route = await store.get(key);
  if (!route) {
    return jsonResponse({ ok: false, error: "unknown_key", key }, 404);
  }

  const url = new URL(req.url);
  const redirectConfig = getRedirectConfig();
  const effectivePort = String(route.port || "").trim() || redirectConfig.port;
  const target = buildRedirectUrl(
    route.ipv6,
    params.rest ? `/${params.rest}` : "/",
    url.search,
    {
      scheme: redirectConfig.scheme,
      port: effectivePort,
    },
  );

  return Response.redirect(target, 302);
};

export type { DownipStore };
export { getDownipStore } from "./store.ts";
