/**
 * dsh-balance-sidebar browser half — registers the sidebar footer widget
 * (live balance + per-workspace token heatmap, rendered above the Settings
 * entry in the `sidebar.footer.action` seat) and drives the per-session cost
 * chips in the sidebar session rows. The host half serves the same-origin
 * `/api/balance-sidebar` JSON endpoints; the client never sees the API key.
 * @module dsh-balance-sidebar/client
 */
import { BalanceWorkspaceWidget, } from "./BalanceWorkspaceWidget.js";
import { en, zh } from "./locales.js";
export { BalanceWorkspaceWidget } from "./BalanceWorkspaceWidget.js";
export { aggregateRows, buildCostMap, heatColor, POLL_MS, } from "./BalanceWorkspaceWidget.js";
export { formatBalance, formatMoney, formatTokens } from "./format.js";
export { sessionIdOfRow, SessionRowCostInjector, sessionRowCostInjector, } from "./session-row.js";
/** Dictionary namespace owned by this plugin. */
const NS = "balanceSidebar";
/** Required services: slots for the footer widget, locale for the copy. */
export const inject = ["slots", "locale", "connection"];
/**
 * Register the footer widget into the sidebar foot, above the Settings seat.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-balance-sidebar: dictionaries");
    ctx.inject(["slots"], (scope) => {
        scope.effect(() => scope.slots.register({
            name: "sidebar.footer.action",
            id: "balance-sidebar",
            locale: NS,
            inject: () => ({}),
        }, BalanceWorkspaceWidget), "dsh-balance-sidebar: footer widget registration");
    });
}
