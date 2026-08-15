/**
 * dsh-balance-sidebar HTTP routes — the browser half talks to the host
 * through plain same-origin JSON endpoints (`/api/balance-sidebar`,
 * `/api/balance-sidebar/refresh` and `/api/balance-sidebar/summary`), which
 * the host answers by querying the DeepSeek Get User Balance endpoint and the
 * session token-usage projection. The client never sees the API key.
 *
 * Ported from dsh-balance-meter (BSD-3-Clause, Copyright Ghost011118);
 * the `/summary` route is new.
 * @module dsh-balance-sidebar/routes
 */
import type { WebRoute } from "@deepseek-ai/dsh-host-webserver";
import type { BalanceSidebarService, SessionCost } from "./service.ts";
/** Browser-facing base path of the balance-sidebar API. */
export declare const BALANCE_SIDEBAR_API_PREFIX = "/api/balance-sidebar";
/**
 * Build the full balance-sidebar API route family for one service.
 * @param service - the balance service.
 * @param resolveSession - resolve a session id to the session (undefined when absent).
 */
export declare function makeBalanceRoutes(service: BalanceSidebarService, resolveSession: (id: string) => {
    session: unknown;
    cost: SessionCost;
} | undefined): WebRoute[];
//# sourceMappingURL=routes.d.ts.map