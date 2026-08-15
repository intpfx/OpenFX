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
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-host-webserver";
import z from "@deepseek-ai/schemastery";
import {
  type BalanceConfig,
  BalanceSidebarService,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
} from "./service.ts";
import { BALANCE_SIDEBAR_API_PREFIX, makeBalanceRoutes } from "./routes.ts";

export { BalanceSidebarService } from "./service.ts";
export type {
  BalanceConfig,
  BalanceInfo,
  BalanceResponse,
  BalanceView,
  SessionCost,
  SessionCostsView,
} from "./service.ts";
export { BALANCE_SIDEBAR_API_PREFIX, makeBalanceRoutes } from "./routes.ts";
export {
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
} from "./service.ts";
export {
  costOfTokens,
  costOfUsage,
  DEFAULT_COST_CONFIG,
  FLASH_COST_CONFIG,
  PRO_COST_CONFIG,
  resolveCostConfig,
} from "./cost.ts";
export type { CostBreakdown, CostConfig } from "./cost.ts";
export { fetchPricing, isPeakHour, PRICING_URL } from "./pricing.ts";
export type { ParsedPrices, PricingSnapshot } from "./pricing.ts";
export {
  aggregateWorkspaces,
  sumTokens,
  totalOf,
  ungroupedSessionIds,
  ZERO_TOKENS,
} from "./aggregate.ts";
export type {
  AggregateOptions,
  WorkspaceAggregate,
  WorkspaceTokens,
} from "./aggregate.ts";

/** Settings namespace of the balance-sidebar capability. */
export const BALANCE_SIDEBAR_SETTINGS_NAMESPACE = "balance-sidebar";

/** Settings section schema: what the web settings surface edits. */
export const BALANCE_SIDEBAR_SETTINGS_SCHEMA = z.object({
  apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
  baseUrl: z.string().default(DEFAULT_BASE_URL),
  refreshIntervalSeconds: z.number().min(0).max(3600).default(
    DEFAULT_REFRESH_INTERVAL_SECONDS,
  ),
  model: z.union([z.const("auto"), z.const("flash"), z.const("pro")]).default(
    "auto",
  ),
  enabled: z.boolean().default(true),
});

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = "balance-sidebar";

/** Services required before the balance service can answer. */
export const inject = ["webServer", "sessions"];

/** Register the balance service and its API routes on the context. */
export function apply(ctx: Context, config: BalanceConfig = {}): void {
  const service = new BalanceSidebarService(ctx, config);

  const base: BalanceConfig = {
    apiKeyEnv: config.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    refreshIntervalSeconds: config.refreshIntervalSeconds ??
      DEFAULT_REFRESH_INTERVAL_SECONDS,
    ...(config.model === undefined ? {} : { model: config.model }),
    ...(config.cost === undefined ? {} : { cost: config.cost }),
    enabled: config.enabled ?? true,
  };
  // The settings surface edits only the schema-declared fields; the cost
  // pricing stays composition-only. `current` follows the schema's resolved
  // shape, widened to the config surface.
  interface SettingsSection {
    apiKeyEnv?: string | null;
    baseUrl?: string | null;
    refreshIntervalSeconds?: number | null;
    model?: "auto" | "flash" | "pro" | null;
    enabled?: boolean | null;
  }
  let current: () => SettingsSection = () => base as SettingsSection;

  const applyConfig = (section: SettingsSection): void => {
    service.setEnabled(section.enabled ?? true);
    if (
      section.model === "auto" || section.model === "flash" ||
      section.model === "pro"
    ) {
      service.setModel(section.model);
    }
    // Simple reconciliation: the public setter and config are always in sync
    // for the fields the settings surface edits; key/baseUrl changes take
    // effect on the next provider query because resolution is per-call.
  };

  // Resolve a session id to its cost snapshot. The sessions store is a
  // service in the inject list; the projection registry is read lazily inside
  // the service so a missing registry degrades to zeroed cost.
  const resolveSession = (
    id: string,
  ): {
    session: unknown;
    cost: ReturnType<BalanceSidebarService["sessionCost"]>;
  } | undefined => {
    const sessions = ctx.get("sessions") as {
      get(sid: string): { id: string } | undefined;
    } | undefined;
    const session = sessions?.get(id);
    if (session === undefined) return undefined;
    return { session, cost: service.sessionCost(session as never) };
  };

  // The routes are registered while the plugin is enabled; toggling the
  // setting off makes the balance API disappear until it is re-enabled.
  const routes = makeBalanceRoutes(service, resolveSession);
  let disposeRoutes: (() => void) | undefined;
  const syncRoutes = (): void => {
    const enabled = current().enabled ?? true;
    if (disposeRoutes === undefined && enabled) {
      disposeRoutes = ctx.effect(
        () => {
          const disposers = routes.map((route) => ctx.webServer.register(route));
          return () => {
            for (const dispose of disposers) dispose();
          };
        },
        "balance-sidebar: routes",
      );
    } else if (disposeRoutes !== undefined && !enabled) {
      disposeRoutes();
      disposeRoutes = undefined;
    }
  };

  installSettingsSection(
    ctx,
    settingsNamespace(BALANCE_SIDEBAR_SETTINGS_NAMESPACE),
    BALANCE_SIDEBAR_SETTINGS_SCHEMA,
    base,
    {
      setSource: (source) => {
        current = source;
      },
      onChange: () => {
        applyConfig(current());
        syncRoutes();
      },
    },
  );
  syncRoutes();
}
