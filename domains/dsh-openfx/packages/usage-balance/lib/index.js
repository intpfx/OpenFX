import { a as PRICING_URL, c as DEFAULT_COST_CONFIG, d as costOfTokens, f as costOfUsage, i as UsageBalanceService, l as FLASH_COST_CONFIG, n as DEFAULT_BASE_URL, o as fetchPricing, p as resolveCostConfig, r as DEFAULT_REFRESH_INTERVAL_SECONDS, s as isPeakHour, t as DEFAULT_API_KEY_ENV, u as PRO_COST_CONFIG } from "./service-BiyPlW5S.js";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
//#region src/routes.ts
/** Browser-facing base path of the usage-balance API. */
const USAGE_BALANCE_API_PREFIX = "/api/usage-balance";
/** Write one JSON response. */
function json(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}
/** Require the method or answer 405. */
function requireMethod(req, res, method) {
	if (req.method === method) return true;
	json(res, 405, {
		ok: false,
		error: "method-not-allowed"
	});
	return false;
}
/** Wrap one async balance read as a GET JSON route. */
function getRoute(path, run) {
	return {
		kind: "exact",
		path,
		handler: (req, res) => {
			if (!requireMethod(req, res, "GET")) return;
			Promise.resolve(run()).then((value) => json(res, 200, value), (error) => {
				json(res, 500, {
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				});
			});
		}
	};
}
/** Wrap one request-aware JSON route (e.g. the session-cost read). */
function getRequestRoute(path, run) {
	return {
		kind: "exact",
		path,
		handler: (req, res) => {
			if (!requireMethod(req, res, "GET")) return;
			Promise.resolve(run(req)).then((value) => json(res, 200, value), (error) => {
				json(res, 500, {
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				});
			});
		}
	};
}
/** Read the `session` query parameter from the request URL. */
function sessionParam(req) {
	const raw = req.url ?? "";
	const q = raw.indexOf("?");
	if (q < 0) return void 0;
	const value = new URLSearchParams(raw.slice(q + 1)).get("session");
	return value === null || value === "" ? void 0 : value;
}
/**
* Build the full usage-balance API route family for one service.
* @param service - the balance service.
* @param resolveSession - resolve a session id to the session (undefined when absent).
*/
function makeBalanceRoutes(service, resolveSession) {
	return [
		getRoute(`${USAGE_BALANCE_API_PREFIX}`, () => service.view()),
		getRoute(`${USAGE_BALANCE_API_PREFIX}/refresh`, () => service.refresh()),
		getRequestRoute(`${USAGE_BALANCE_API_PREFIX}/cost`, (req) => {
			const id = sessionParam(req);
			if (id === void 0) return {
				ok: false,
				error: "missing-session"
			};
			const resolved = resolveSession(id);
			if (resolved === void 0) return {
				ok: false,
				error: "unknown-session"
			};
			return {
				ok: true,
				...resolved.cost
			};
		}),
		getRoute(`${USAGE_BALANCE_API_PREFIX}/summary`, async () => {
			const [balance, costs] = await Promise.all([service.view(), Promise.resolve(service.sessionCosts())]);
			return {
				balance,
				costs
			};
		})
	];
}
//#endregion
//#region src/aggregate.ts
/** Zeroed token buckets. */
const ZERO_TOKENS = {
	uncachedInputTokens: 0,
	outputTokens: 0,
	cacheReadTokens: 0,
	cacheWriteTokens: 0
};
/** Sum two token buckets into a fresh object. */
function sumTokens(a, b) {
	return {
		uncachedInputTokens: a.uncachedInputTokens + b.uncachedInputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
		cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens
	};
}
/** Total of the four buckets (the heatmap magnitude). */
function totalOf(tokens) {
	return tokens.uncachedInputTokens + tokens.outputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens;
}
/** Session ids that belong to no workspace (and are not archived). */
function ungroupedSessionIds(allSessionIds, workspaces, archivedSessionIds) {
	const archived = new Set(archivedSessionIds);
	const assigned = /* @__PURE__ */ new Set();
	for (const workspace of workspaces) for (const id of workspace.sessionIds) assigned.add(id);
	return allSessionIds.filter((id) => !assigned.has(id) && !archived.has(id));
}
/** Fold one aggregate row from a workspace's session ids. */
function foldSessionIds(sessionIds, opts) {
	let tokens = ZERO_TOKENS;
	let cost = 0;
	let pricedSessions = 0;
	for (const id of sessionIds) {
		const usage = opts.usageOf(id);
		if (usage !== void 0) tokens = sumTokens(tokens, usage);
		const sessionCost = opts.costOf(id);
		if (typeof sessionCost === "number" && Number.isFinite(sessionCost)) {
			cost += sessionCost;
			pricedSessions += 1;
		}
	}
	return {
		tokens,
		cost,
		pricedSessions
	};
}
/**
* Aggregate per-workspace token usage and cost, in input order, followed by
* one ungrouped bucket when such sessions exist.
* @param workspaces - workspace rows with their session membership.
* @param ungroupedIds - sessions belonging to no workspace (see
*   {@link ungroupedSessionIds}).
* @param opts - per-session reads.
*/
function aggregateWorkspaces(workspaces, ungroupedIds, opts) {
	const rows = workspaces.map((workspace) => {
		const { tokens, cost, pricedSessions } = foldSessionIds(workspace.sessionIds, opts);
		return {
			workspaceId: workspace.id,
			title: workspace.title,
			sessionIds: [...workspace.sessionIds],
			tokens,
			totalTokens: totalOf(tokens),
			cost,
			pricedSessions
		};
	});
	if (ungroupedIds.length > 0) {
		const { tokens, cost, pricedSessions } = foldSessionIds(ungroupedIds, opts);
		rows.push({
			workspaceId: void 0,
			title: "",
			sessionIds: [...ungroupedIds],
			tokens,
			totalTokens: totalOf(tokens),
			cost,
			pricedSessions
		});
	}
	return rows;
}
//#endregion
//#region src/index.ts
/** Settings namespace of the usage-balance capability. */
const USAGE_BALANCE_SETTINGS_NAMESPACE = "usage-balance";
/** Settings section schema: what the web settings surface edits. */
const USAGE_BALANCE_SETTINGS_SCHEMA = z.object({
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
	baseUrl: z.string().default(DEFAULT_BASE_URL),
	refreshIntervalSeconds: z.number().min(0).max(3600).default(30),
	model: z.union([
		z.const("auto"),
		z.const("flash"),
		z.const("pro")
	]).default("auto"),
	enabled: z.boolean().default(true)
});
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
const name = "usage-balance";
/** Services required before the balance service can answer. */
const inject = ["webServer", "sessions"];
/** Register the balance service and its API routes on the context. */
function apply(ctx, config = {}) {
	const service = new UsageBalanceService(ctx, config);
	const base = {
		apiKeyEnv: config.apiKeyEnv ?? "DEEPSEEK_API_KEY",
		baseUrl: config.baseUrl ?? "https://api.deepseek.com",
		refreshIntervalSeconds: config.refreshIntervalSeconds ?? 30,
		...config.model === void 0 ? {} : { model: config.model },
		...config.cost === void 0 ? {} : { cost: config.cost },
		enabled: config.enabled ?? true
	};
	let current = () => base;
	const applyConfig = (section) => {
		service.setEnabled(section.enabled ?? true);
		if (section.model === "auto" || section.model === "flash" || section.model === "pro") service.setModel(section.model);
	};
	const resolveSession = (id) => {
		const session = ctx.get("sessions")?.get(id);
		if (session === void 0) return void 0;
		return {
			session,
			cost: service.sessionCost(session)
		};
	};
	const routes = makeBalanceRoutes(service, resolveSession);
	let disposeRoutes;
	const syncRoutes = () => {
		const enabled = current().enabled ?? true;
		if (disposeRoutes === void 0 && enabled) disposeRoutes = ctx.effect(() => {
			const disposers = routes.map((route) => ctx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "usage-balance: routes");
		else if (disposeRoutes !== void 0 && !enabled) {
			disposeRoutes();
			disposeRoutes = void 0;
		}
	};
	installSettingsSection(ctx, settingsNamespace(USAGE_BALANCE_SETTINGS_NAMESPACE), USAGE_BALANCE_SETTINGS_SCHEMA, base, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {
			applyConfig(current());
			syncRoutes();
		}
	});
	syncRoutes();
}
//#endregion
export { DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, DEFAULT_COST_CONFIG, DEFAULT_REFRESH_INTERVAL_SECONDS, FLASH_COST_CONFIG, PRICING_URL, PRO_COST_CONFIG, USAGE_BALANCE_API_PREFIX, USAGE_BALANCE_SETTINGS_NAMESPACE, USAGE_BALANCE_SETTINGS_SCHEMA, UsageBalanceService, ZERO_TOKENS, aggregateWorkspaces, apply, costOfTokens, costOfUsage, fetchPricing, inject, isPeakHour, makeBalanceRoutes, name, resolveCostConfig, sumTokens, totalOf, ungroupedSessionIds };
