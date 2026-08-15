/**
 * dsh-balance-sidebar browser half — registers the sidebar footer widget
 * (live balance + per-workspace token heatmap, rendered above the Settings
 * entry in the `sidebar.footer.action` seat) and drives the per-session cost
 * chips in the sidebar session rows. The host half serves the same-origin
 * `/api/balance-sidebar` JSON endpoints; the client never sees the API key.
 * @module dsh-balance-sidebar/client
 */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { type BalanceSidebarKey } from "./locales.ts";
export { BalanceWorkspaceWidget } from "./BalanceWorkspaceWidget.tsx";
export type { BalanceWorkspaceWidgetProps } from "./BalanceWorkspaceWidget.tsx";
export { aggregateRows, buildCostMap, heatColor, POLL_MS, } from "./BalanceWorkspaceWidget.tsx";
export { formatBalance, formatMoney, formatTokens } from "./format.ts";
export { sessionIdOfRow, SessionRowCostInjector, sessionRowCostInjector, } from "./session-row.ts";
declare module "@deepseek-ai/dsh-client-ui-slots" {
    interface LocaleNamespaceMap {
        /** dsh-balance-sidebar widget and settings copy. */
        balanceSidebar: BalanceSidebarKey;
    }
}
/** Required services: slots for the footer widget, locale for the copy. */
export declare const inject: string[];
/** The injected business face (empty today: the widget calls the API directly). */
export interface BalanceSidebarInjected {
}
/**
 * Register the footer widget into the sidebar foot, above the Settings seat.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map