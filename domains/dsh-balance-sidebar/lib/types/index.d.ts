/**
 * dsh-balance-sidebar host half — mounts the balance service, the per-session
 * cost estimator and their HTTP routes. The browser half (the `./client`
 * entry) reads the DeepSeek account balance, per-session costs and the
 * workspace token aggregates through the same-origin `/api/balance-sidebar`
 * JSON endpoints. Install via
 * `dsh plugin --profile web add link:<this-directory>`; the
 * cordis.patch.yml inserts this plugin row.
 * @module dsh-balance-sidebar
 */
import { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { type BalanceConfig } from "./service.ts";
export { BalanceSidebarService } from "./service.ts";
export type { BalanceConfig, BalanceInfo, BalanceResponse, BalanceView, SessionCost, SessionCostsView, } from "./service.ts";
export { BALANCE_SIDEBAR_API_PREFIX, makeBalanceRoutes } from "./routes.ts";
export { DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, DEFAULT_REFRESH_INTERVAL_SECONDS, } from "./service.ts";
export { costOfTokens, costOfUsage, DEFAULT_COST_CONFIG, FLASH_COST_CONFIG, PRO_COST_CONFIG, resolveCostConfig, } from "./cost.ts";
export type { CostBreakdown, CostConfig } from "./cost.ts";
export { fetchPricing, isPeakHour, PRICING_URL } from "./pricing.ts";
export type { ParsedPrices, PricingSnapshot } from "./pricing.ts";
export { aggregateWorkspaces, sumTokens, totalOf, ungroupedSessionIds, ZERO_TOKENS, } from "./aggregate.ts";
export type { AggregateOptions, WorkspaceAggregate, WorkspaceTokens, } from "./aggregate.ts";
/** Settings namespace of the balance-sidebar capability. */
export declare const BALANCE_SIDEBAR_SETTINGS_NAMESPACE = "balance-sidebar";
/** Settings section schema: what the web settings surface edits. */
export declare const BALANCE_SIDEBAR_SETTINGS_SCHEMA: z<Schemastery.ObjectS<{
    apiKeyEnv: z<string, string>;
    baseUrl: z<string, string>;
    refreshIntervalSeconds: z<number, number>;
    model: z<"flash" | "pro" | "auto", "flash" | "pro" | "auto">;
    enabled: z<boolean, boolean>;
}>, Schemastery.ObjectT<{
    apiKeyEnv: z<string, string>;
    baseUrl: z<string, string>;
    refreshIntervalSeconds: z<number, number>;
    model: z<"flash" | "pro" | "auto", "flash" | "pro" | "auto">;
    enabled: z<boolean, boolean>;
}>>;
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export declare const name = "balance-sidebar";
/** Services required before the balance service can answer. */
export declare const inject: string[];
/** Register the balance service and its API routes on the context. */
export declare function apply(ctx: Context, config?: BalanceConfig): void;
//# sourceMappingURL=index.d.ts.map