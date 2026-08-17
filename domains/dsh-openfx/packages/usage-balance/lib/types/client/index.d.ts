/**
 * dsh-usage-balance browser half — registers the sidebar footer widget
 * (live balance + per-workspace token heatmap, rendered above the Settings
 * entry in the `sidebar.footer.action` seat) and drives the per-session cost
 * chips in the sidebar session rows. The host half serves the same-origin
 * `/api/usage-balance` JSON endpoints; the client never sees the API key.
 * @module dsh-usage-balance/client
 */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { type UsageBalanceKey } from "./locales.ts";
export { UsageBalanceWidget } from "./UsageBalanceWidget.tsx";
export type { UsageBalanceWidgetProps } from "./UsageBalanceWidget.tsx";
export { aggregateRows, buildCostMap, heatColor, POLL_MS, } from "./UsageBalanceWidget.tsx";
export { formatBalance, formatMoney, formatTokens } from "./format.ts";
export { sessionIdOfRow, SessionRowCostInjector, sessionRowCostInjector, } from "./session-row.ts";
declare module "@deepseek-ai/dsh-client-ui-slots" {
    interface LocaleNamespaceMap {
        /** dsh-usage-balance widget and settings copy. */
        usageBalance: UsageBalanceKey;
    }
}
/** Required services: slots for the footer widget, locale for the copy. */
export declare const inject: string[];
/** The injected business face (empty today: the widget calls the API directly). */
export interface UsageBalanceInjected {
}
/**
 * Register the footer widget into the sidebar foot, above the Settings seat.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map