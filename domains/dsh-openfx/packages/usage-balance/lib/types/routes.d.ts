/**
 * dsh-usage-balance HTTP routes — the browser half talks to the host
 * through plain same-origin JSON endpoints (`/api/usage-balance`,
 * `/api/usage-balance/refresh` and `/api/usage-balance/summary`), which
 * the host answers by querying the DeepSeek Get User Balance endpoint and the
 * session token-usage projection. The client never sees the API key.
 *
 * Ported from dsh-balance-meter (BSD-3-Clause, Copyright Ghost011118);
 * the `/summary` route is new.
 * @module dsh-usage-balance/routes
 */
import type { WebRoute } from "@deepseek-ai/dsh-host-webserver";
import type { UsageBalanceService, SessionCost } from "./service.ts";
/** Browser-facing base path of the usage-balance API. */
export declare const USAGE_BALANCE_API_PREFIX = "/api/usage-balance";
/**
 * Build the full usage-balance API route family for one service.
 * @param service - the balance service.
 * @param resolveSession - resolve a session id to the session (undefined when absent).
 */
export declare function makeBalanceRoutes(service: UsageBalanceService, resolveSession: (id: string) => {
    session: unknown;
    cost: SessionCost;
} | undefined): WebRoute[];
//# sourceMappingURL=routes.d.ts.map