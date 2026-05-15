// crondownip.ts
// 服务器端：接收客户端上传的 key->ipv6 映射，并按 key 提供重定向端点。
//
// - POST /update        接收 JSON: { "home": {"ipv6":"2001:db8::1","port":80}, ... }
// - GET  /update        查看当前映射
// - GET  /:key/*        302 重定向到 http(s)://[ipv6][:port]/<rest>
//
// 环境变量：
// - DOWNIP_HOST             监听地址（默认 ::）
// - DOWNIP_PORT             监听端口（默认 8080）
// - DOWNIP_KV_PATH          Deno KV 路径（默认使用内置默认位置）
// - DOWNIP_REDIRECT_SCHEME  重定向协议（默认 http）
// - DOWNIP_REDIRECT_PORT    重定向端口（可选）

type RouteValue = {
	ipv6: string;
	port: number;
};

type Mapping = Record<string, RouteValue>;

function nowIso(): string {
	return new Date().toISOString();
}

function log(level: "INFO" | "WARN" | "ERROR", msg: string, data?: Record<string, unknown>): void {
	const line = JSON.stringify({ ts: nowIso(), level, msg, ...(data ?? {}) });
	if (level === "ERROR") console.error(line);
	else console.log(line);
}

function isValidKey(key: string): boolean {
	if (!key) return false;
	if (key.toLowerCase() === "update") return false;
	return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(key);
}

function stripZoneIndex(addr: string): string {
	const i = addr.indexOf("%");
	return i >= 0 ? addr.slice(0, i) : addr;
}

function normalizeIpv6(addr: string): string {
	return stripZoneIndex(addr.trim()).toLowerCase();
}

function isProbablyIpv6(addr: string): boolean {
	const a = normalizeIpv6(addr);
	// 简单判断：包含冒号即可（服务端不做过强校验）
	return a.includes(":") && /^[0-9a-f:.]+$/.test(a);
}

function isValidPort(v: unknown): v is number {
	if (typeof v !== "number") return false;
	if (!Number.isFinite(v)) return false;
	const p = Math.floor(v);
	return p >= 1 && p <= 65535;
}

function getEnvInt(name: string, def: number): number {
	const v = Number(Deno.env.get(name) ?? "");
	return Number.isFinite(v) && v > 0 ? Math.floor(v) : def;
}

function getEnvStr(name: string, def: string): string {
	return (Deno.env.get(name) ?? def).trim();
}

function withCors(headers: Headers): Headers {
	headers.set("access-control-allow-origin", "*");
	headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
	headers.set("access-control-allow-headers", "content-type");
	return headers;
}

function jsonResponse(body: unknown, status = 200): Response {
	const headers = withCors(new Headers({ "content-type": "application/json; charset=utf-8" }));
	return new Response(JSON.stringify(body), { status, headers });
}

function textResponse(body: string, status = 200): Response {
	const headers = withCors(new Headers({ "content-type": "text/plain; charset=utf-8" }));
	return new Response(body, { status, headers });
}

function buildRedirectUrl(
	ipv6: string,
	restPath: string,
	search: string,
	cfg: { scheme: string; port?: string },
): string {
	const host = `[${normalizeIpv6(ipv6)}]`;
	const portPart = cfg.port ? `:${cfg.port}` : "";
	const path = restPath.startsWith("/") ? restPath : `/${restPath}`;
	return `${cfg.scheme}://${host}${portPart}${path}${search}`;
}

async function kvGetMapping(kv: Deno.Kv): Promise<Mapping> {
	const out: Mapping = {};
	for await (const entry of kv.list<RouteValue>({ prefix: ["routes"] })) {
		const key = entry.key[1];
		if (typeof key !== "string") continue;
		out[key] = entry.value;
	}
	return out;
}

async function kvSetRoute(kv: Deno.Kv, key: string, value: RouteValue): Promise<void> {
	await kv.set(["routes", key], value);
}

async function kvGetRoute(kv: Deno.Kv, key: string): Promise<RouteValue | null> {
	const res = await kv.get<RouteValue>(["routes", key]);
	return res.value ?? null;
}

async function main(): Promise<void> {
	const host = getEnvStr("DOWNIP_HOST", "::");
	const port = getEnvInt("DOWNIP_PORT", 8080);
	const kvPath = (Deno.env.get("DOWNIP_KV_PATH") ?? "").trim() || undefined;
	const scheme = getEnvStr("DOWNIP_REDIRECT_SCHEME", "http");
	const redirectPort = (Deno.env.get("DOWNIP_REDIRECT_PORT") ?? "").trim() || undefined;

	const kv = await Deno.openKv(kvPath);
	log("INFO", "server starting", { host, port, kvPath: kvPath ?? "(default)", scheme, redirectPort });

	Deno.serve({ hostname: host, port }, async (req: Request) => {
		const url = new URL(req.url);
		const path = url.pathname.replace(/\/+$/, "") || "/";

		if (req.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: withCors(new Headers()) });
		}

		if (path === "/") {
			return jsonResponse({
				ok: true,
				endpoints: {
					update: { method: "POST", path: "/update" },
					query: { method: "GET", path: "/update" },
					redirect: { method: "GET", path: "/:key/*" },
				},
			});
		}

		if (path === "/update") {
			if (req.method === "GET") {
				const mapping = await kvGetMapping(kv);
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

			for (const [k, v] of Object.entries(incoming)) {
				const key = String(k).trim();
				if (!isValidKey(key)) {
					rejected[key] = "invalid_key";
					continue;
				}
				if (!v || typeof v !== "object") {
					rejected[key] = "invalid_value";
					continue;
				}
				const ipv6 = typeof (v as Record<string, unknown>).ipv6 === "string"
					? String((v as Record<string, unknown>).ipv6).trim()
					: "";
				const portV = (v as Record<string, unknown>).port;
				if (!ipv6 || !isProbablyIpv6(ipv6)) {
					rejected[key] = "invalid_ipv6";
					continue;
				}
				const portNum = typeof portV === "string" ? Number(portV) : (portV as number);
				if (!isValidPort(portNum)) {
					rejected[key] = "invalid_port";
					continue;
				}
				const value: RouteValue = { ipv6: normalizeIpv6(ipv6), port: Math.floor(portNum) };
				await kvSetRoute(kv, key, value);
				stored[key] = value;
			}

			log("INFO", "update received", { stored, rejected, count: Object.keys(stored).length });
			return jsonResponse({ ok: true, stored, rejected, count: Object.keys(stored).length });
		}

		// redirect handler: /:key/*
		if (req.method !== "GET" && req.method !== "HEAD") {
			return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
		}

		const parts = path.split("/").filter(Boolean);
		const key = parts[0] ?? "";
		if (!key) return jsonResponse({ ok: false, error: "not_found" }, 404);
		if (key.toLowerCase() === "update") {
			return jsonResponse({ ok: false, error: "reserved" }, 404);
		}

		const route = await kvGetRoute(kv, key);
		if (!route) {
			return jsonResponse({ ok: false, error: "unknown_key", key }, 404);
		}

		const restPath = `/${parts.slice(1).join("/")}`.replace(/\/+$|^\/$/g, "");
		const finalRest = restPath === "" ? "/" : restPath;
		const effectivePort = String(route.port || "").trim() || redirectPort;
		const target = buildRedirectUrl(route.ipv6, finalRest, url.search, { scheme, port: effectivePort });

		log("INFO", "redirect", { key, target });
		return Response.redirect(target, 302);
	});
}

if (import.meta.main) {
	await main();
}
