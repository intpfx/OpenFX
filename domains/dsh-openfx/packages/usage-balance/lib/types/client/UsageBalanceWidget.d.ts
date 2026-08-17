/**
 * dsh-usage-balance footer widget — the block rendered in the
 * `sidebar.footer.action` seat (directly above the Settings entry). It shows
 * the live DeepSeek account balance and a per-workspace token heatmap with
 * estimated costs, and drives the per-session cost chips in the session rows.
 *
 * Data flow:
 * - balance + host-priced per-session costs: polled from the host
 *   `/api/usage-balance/summary` endpoint (~30 s, manual refresh available);
 * - per-session token usage: read live from the session list projection
 *   values (`useSessions`), so the heatmap updates as turns stream;
 * - sessions the host does not price (not live on the host) fall back to the
 *   flash preset applied to their projection tokens.
 * @module dsh-usage-balance/client/UsageBalanceWidget
 */
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type { SessionListState } from "@deepseek-ai/dsh-client-runtime/client";
import { type WorkspaceAggregate } from "../aggregate.ts";
import type { BalanceView, SessionCost } from "../service.ts";
import { NS } from "./locales.ts";
/** Host summary response (same-origin JSON). */
export interface UsageBalanceSummary {
    balance: BalanceView;
    costs: {
        sessions: Record<string, SessionCost>;
        pricedAt: number;
    };
}
/** Poll interval for the host summary. */
export declare const POLL_MS = 30000;
/** Minimum gap between activity-triggered summary refreshes (streaming turns
 * update projections continuously, so this keeps the host from being
 * hammered while the widget still reacts within seconds of new usage). */
export declare const ACTIVITY_REFRESH_MIN_MS = 10000;
/** Session summary shape we read (subset of the runtime session row). */
interface SessionRowLike {
    id: string;
    blank: boolean;
    projectionValues?: {
        tokenUsage?: {
            uncachedInputTokens: number;
            outputTokens: number;
            cacheReadTokens: number;
            cacheWriteTokens: number;
        };
    };
}
/**
 * Build the per-session cost map: host-priced costs win; sessions the host
 * does not price fall back to the flash preset over their live projection
 * tokens. Blank (new) sessions contribute nothing.
 */
export declare function buildCostMap(sessions: readonly SessionRowLike[], summary: UsageBalanceSummary | undefined): Map<string, number>;
/** Heatmap fill color for one row, by its share of the largest row. */
export declare function heatColor(share: number): string;
/** Aggregate rows with the ungrouped bucket merged in (stable input order). */
export declare function aggregateRows(sessions: SessionListState, workspaces: {
    items: readonly {
        workspaceId: string;
        title: string;
        sessionIds: readonly string[];
    }[];
    archivedSessionIds: readonly string[];
}, costMap: ReadonlyMap<string, number>): WorkspaceAggregate[];
/** Composed props of the footer widget (owner share + global kit + locale). */
export type UsageBalanceWidgetProps = PropsRuntime<"sidebar.footer.action"> & PropsLocale<typeof NS>;
/** The footer widget component. */
export declare function UsageBalanceWidget(props: UsageBalanceWidgetProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=UsageBalanceWidget.d.ts.map