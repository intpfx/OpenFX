/**
 * dsh-usage-balance browser half — registers the sidebar footer widget
 * (live balance + per-workspace token heatmap, rendered above the Settings
 * entry in the `sidebar.footer.action` seat) and drives the per-session cost
 * chips in the sidebar session rows. The host half serves the same-origin
 * `/api/usage-balance` JSON endpoints; the client never sees the API key.
 * @module dsh-usage-balance/client
 */

import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from "@deepseek-ai/dsh-client-locale/client";
// Type-only: pulls the ui-sidebar SlotMap merge (the footer action entry).
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import {
  UsageBalanceWidget,
  type UsageBalanceWidgetProps,
} from "./UsageBalanceWidget.tsx";
import { type UsageBalanceKey, en, zh } from "./locales.ts";

export { UsageBalanceWidget } from "./UsageBalanceWidget.tsx";
export type { UsageBalanceWidgetProps } from "./UsageBalanceWidget.tsx";
export {
  aggregateRows,
  buildCostMap,
  heatColor,
  POLL_MS,
} from "./UsageBalanceWidget.tsx";
export { formatBalance, formatMoney, formatTokens } from "./format.ts";
export {
  sessionIdOfRow,
  SessionRowCostInjector,
  sessionRowCostInjector,
} from "./session-row.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    /** dsh-usage-balance widget and settings copy. */
    usageBalance: UsageBalanceKey;
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = "usageBalance";

/** Required services: slots for the footer widget, locale for the copy. */
export const inject = ["slots", "locale", "connection"];

/** The injected business face (empty today: the widget calls the API directly). */
export interface UsageBalanceInjected {}

/**
 * Register the footer widget into the sidebar foot, above the Settings seat.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    "dsh-usage-balance: dictionaries",
  );

  ctx.inject(["slots"], (scope: ClientContext) => {
    scope.effect(
      () =>
        scope.slots.register({
          name: "sidebar.footer.action",
          id: "usage-balance",
          locale: NS,
          inject: (): UsageBalanceInjected => ({}),
        }, UsageBalanceWidget),
      "dsh-usage-balance: footer widget registration",
    );
  });
}
