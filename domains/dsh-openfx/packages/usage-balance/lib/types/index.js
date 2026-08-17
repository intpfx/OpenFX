/**
 * dsh-usage-balance host half — mounts the balance service, the per-session
 * cost estimator and their HTTP routes. The browser half (the `./client`
 * entry) reads the DeepSeek account balance, per-session costs and the
 * workspace token aggregates through the same-origin `/api/usage-balance`
 * JSON endpoints. Install via
 * `dsh plugin --profile web add link:<this-directory>`; the
 * cordis.patch.yml inserts this plugin row.
 * @module dsh-usage-balance
 */
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { UsageBalanceService, DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, DEFAULT_REFRESH_INTERVAL_SECONDS, } from "./service.js";
import { makeBalanceRoutes } from "./routes.js";
export { UsageBalanceService } from "./service.js";
export { USAGE_BALANCE_API_PREFIX, makeBalanceRoutes } from "./routes.js";
export { DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, DEFAULT_REFRESH_INTERVAL_SECONDS, } from "./service.js";
export { costOfTokens, costOfUsage, DEFAULT_COST_CONFIG, FLASH_COST_CONFIG, PRO_COST_CONFIG, resolveCostConfig, } from "./cost.js";
export { fetchPricing, isPeakHour, PRICING_URL } from "./pricing.js";
export { aggregateWorkspaces, sumTokens, totalOf, ungroupedSessionIds, ZERO_TOKENS, } from "./aggregate.js";
/** Settings namespace of the usage-balance capability. */
export const USAGE_BALANCE_SETTINGS_NAMESPACE = "usage-balance";
/** Settings section schema: what the web settings surface edits. */
export const USAGE_BALANCE_SETTINGS_SCHEMA = z.object({
    apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
    baseUrl: z.string().default(DEFAULT_BASE_URL),
    refreshIntervalSeconds: z.number().min(0).max(3600).default(DEFAULT_REFRESH_INTERVAL_SECONDS),
    model: z.union([z.const("auto"), z.const("flash"), z.const("pro")]).default("auto"),
    enabled: z.boolean().default(true),
});
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = "usage-balance";
/** Services required before the balance service can answer. */
export const inject = ["webServer", "sessions"];
/** Register the balance service and its API routes on the context. */
export function apply(ctx, config = {}) {
    const service = new UsageBalanceService(ctx, config);
    const base = {
        apiKeyEnv: config.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
        baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
        refreshIntervalSeconds: config.refreshIntervalSeconds ??
            DEFAULT_REFRESH_INTERVAL_SECONDS,
        ...(config.model === undefined ? {} : { model: config.model }),
        ...(config.cost === undefined ? {} : { cost: config.cost }),
        enabled: config.enabled ?? true,
    };
    let current = () => base;
    const applyConfig = (section) => {
        service.setEnabled(section.enabled ?? true);
        if (section.model === "auto" || section.model === "flash" ||
            section.model === "pro") {
            service.setModel(section.model);
        }
        // Simple reconciliation: the public setter and config are always in sync
        // for the fields the settings surface edits; key/baseUrl changes take
        // effect on the next provider query because resolution is per-call.
    };
    // Resolve a session id to its cost snapshot. The sessions store is a
    // service in the inject list; the projection registry is read lazily inside
    // the service so a missing registry degrades to zeroed cost.
    const resolveSession = (id) => {
        const sessions = ctx.get("sessions");
        const session = sessions?.get(id);
        if (session === undefined)
            return undefined;
        return { session, cost: service.sessionCost(session) };
    };
    // The routes are registered while the plugin is enabled; toggling the
    // setting off makes the balance API disappear until it is re-enabled.
    const routes = makeBalanceRoutes(service, resolveSession);
    let disposeRoutes;
    const syncRoutes = () => {
        const enabled = current().enabled ?? true;
        if (disposeRoutes === undefined && enabled) {
            disposeRoutes = ctx.effect(() => {
                const disposers = routes.map((route) => ctx.webServer.register(route));
                return () => {
                    for (const dispose of disposers)
                        dispose();
                };
            }, "usage-balance: routes");
        }
        else if (disposeRoutes !== undefined && !enabled) {
            disposeRoutes();
            disposeRoutes = undefined;
        }
    };
    installSettingsSection(ctx, settingsNamespace(USAGE_BALANCE_SETTINGS_NAMESPACE), USAGE_BALANCE_SETTINGS_SCHEMA, base, {
        setSource: (source) => {
            current = source;
        },
        onChange: () => {
            applyConfig(current());
            syncRoutes();
        },
    });
    syncRoutes();
}
