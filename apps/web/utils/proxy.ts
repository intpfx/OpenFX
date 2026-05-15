const copyHeaders = (headers: Headers): Headers => {
  const nextHeaders = new Headers();

  for (const entry of headers.entries()) {
    nextHeaders.append(...entry);
  }

  return nextHeaders;
};

const normalizeProxyUpstream = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "");
  }

  return `http://${trimmed.replace(/\/+$/, "")}`;
};

export const getProxyUpstream = (): string | null => {
  const normalized = normalizeProxyUpstream(Deno.env.get("OPENFX_PROXY_UPSTREAM") ?? "");
  return normalized || null;
};

export const isProxyEnabled = (): boolean => getProxyUpstream() !== null;

export const buildProxyTargetUrl = (req: Request, restPath?: string): URL | null => {
  const upstream = getProxyUpstream();
  if (!upstream) {
    return null;
  }

  const target = new URL(upstream);
  const incoming = new URL(req.url);
  target.pathname = `${target.pathname.replace(/\/+$/, "")}/${restPath ?? ""}`.replace(/\/+/g, "/");
  target.search = incoming.search;
  return target;
};

const rewriteRequestHeaders = (req: Request, target: URL): Headers => {
  const headers = copyHeaders(req.headers);
  headers.delete("x-deno-transparent");
  headers.set("referer", target.toString());
  headers.set("origin", target.origin);
  return headers;
};

const rewriteResponseHeaders = (res: Response, domain: string): Headers => {
  const headers = copyHeaders(res.headers);
  headers.set("access-control-allow-origin", "*");

  const cookie = headers.get("set-cookie");
  if (cookie) {
    headers.set("set-cookie", cookie.replace(/domain=(.+?);/i, `domain=${domain};`));
  }

  headers.delete("x-frame-options");
  return headers;
};

export const proxyRequest = async (req: Request, restPath?: string): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: new Headers({
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
      }),
    });
  }

  const target = buildProxyTargetUrl(req, restPath);
  if (!target) {
    return Response.json({
      ok: false,
      error: "proxy_not_configured",
      hint: "请设置 OPENFX_PROXY_UPSTREAM 环境变量后再使用 /api/proxy/*",
    }, { status: 503, headers: { "access-control-allow-origin": "*" } });
  }

  const upstreamResponse = await fetch(target, {
    method: req.method,
    headers: rewriteRequestHeaders(req, target),
    body: req.body,
    redirect: req.redirect,
  });

  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    return Response.redirect(req.url, upstreamResponse.status);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: rewriteResponseHeaders(upstreamResponse, new URL(req.url).host),
  });
};
