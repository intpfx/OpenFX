import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * dsh-balance-sidebar footer widget — the block rendered in the
 * `sidebar.footer.action` seat (directly above the Settings entry). It shows
 * the live DeepSeek account balance and a per-workspace token heatmap with
 * estimated costs, and drives the per-session cost chips in the session rows.
 *
 * Data flow:
 * - balance + host-priced per-session costs: polled from the host
 *   `/api/balance-sidebar/summary` endpoint (~30 s, manual refresh available);
 * - per-session token usage: read live from the session list projection
 *   values (`useSessions`), so the heatmap updates as turns stream;
 * - sessions the host does not price (not live on the host) fall back to the
 *   flash preset applied to their projection tokens.
 * @module dsh-balance-sidebar/client/BalanceWorkspaceWidget
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aggregateWorkspaces, ungroupedSessionIds, } from "../aggregate.js";
import { costOfUsage, FLASH_COST_CONFIG } from "../cost.js";
import { formatBalance, formatMoney, formatTokens } from "./format.js";
import { sessionRowCostInjector } from "./session-row.js";
import css from "./widget.module.css";
/** Poll interval for the host summary. */
export const POLL_MS = 30_000;
/** Minimum gap between activity-triggered summary refreshes (streaming turns
 * update projections continuously, so this keeps the host from being
 * hammered while the widget still reacts within seconds of new usage). */
export const ACTIVITY_REFRESH_MIN_MS = 10_000;
/** Same-origin JSON fetch helper. */
async function summaryFetch() {
    const response = await fetch("/api/balance-sidebar/summary");
    if (!response.ok) {
        throw new Error(`balance-sidebar summary failed: ${response.status}`);
    }
    return (await response.json());
}
/**
 * Build the per-session cost map: host-priced costs win; sessions the host
 * does not price fall back to the flash preset over their live projection
 * tokens. Blank (new) sessions contribute nothing.
 */
export function buildCostMap(sessions, summary) {
    const map = new Map();
    const hostCosts = summary?.costs?.sessions ?? {};
    for (const session of sessions) {
        if (session.blank)
            continue;
        const host = hostCosts[session.id];
        if (host !== undefined && Number.isFinite(host.cost)) {
            map.set(session.id, host.cost);
            continue;
        }
        const usage = session.projectionValues?.tokenUsage;
        if (usage !== undefined) {
            map.set(session.id, costOfUsage({
                inputTokens: usage.uncachedInputTokens,
                outputTokens: usage.outputTokens,
                cacheReadTokens: usage.cacheReadTokens,
                cacheWriteTokens: usage.cacheWriteTokens,
            }, FLASH_COST_CONFIG));
        }
    }
    return map;
}
/** Heatmap fill color for one row, by its share of the largest row. */
export function heatColor(share) {
    const clamped = Math.max(0, Math.min(1, share));
    return `hsla(210, 70%, 50%, ${(0.12 + 0.88 * clamped).toFixed(3)})`;
}
/** Aggregate rows with the ungrouped bucket merged in (stable input order). */
export function aggregateRows(sessions, workspaces, costMap) {
    const byId = sessions.byId;
    const usageOf = (sessionId) => byId[sessionId]?.projectionValues?.tokenUsage;
    const costOf = (sessionId) => costMap.get(sessionId);
    const ungrouped = ungroupedSessionIds(sessions.ids, workspaces.items, workspaces.archivedSessionIds);
    return aggregateWorkspaces(workspaces.items.map((workspace) => ({
        id: workspace.workspaceId,
        title: workspace.title,
        sessionIds: workspace.sessionIds,
    })), ungrouped, { usageOf, costOf });
}
/** The footer widget component. */
export function BalanceWorkspaceWidget(props) {
    const { wide, useSessions, useWorkspaces, t } = props;
    const sessions = useSessions((state) => state);
    const workspaces = useWorkspaces((state) => state);
    const [summary, setSummary] = useState(undefined);
    const [error, setError] = useState(undefined);
    const refresh = useCallback(async () => {
        try {
            setError(undefined);
            setSummary(await summaryFetch());
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    }, []);
    // The per-session rows (projection values included) — session activity
    // flows through this reference, driving the activity-triggered refresh.
    const sessionList = sessions.byId;
    // Poll the host summary; re-run the initial fetch after failures.
    useEffect(() => {
        let alive = true;
        let timer;
        const tick = async () => {
            if (!alive)
                return;
            try {
                setError(undefined);
                const next = await summaryFetch();
                if (alive)
                    setSummary(next);
            }
            catch (cause) {
                if (alive) {
                    setError(cause instanceof Error ? cause.message : String(cause));
                }
            }
        };
        void tick();
        timer = setInterval(() => {
            void tick();
        }, POLL_MS);
        return () => {
            alive = false;
            if (timer !== undefined)
                clearInterval(timer);
        };
    }, []);
    // Activity-triggered refresh: whenever the session list changes (new token
    // projection values stream in), re-pull the host summary so the host-priced
    // costs and the balance readout catch up promptly — throttled so a running
    // turn does not issue a request per projection frame. The widget is fully
    // automatic; there is no manual refresh affordance.
    const lastActivityRefreshRef = useRef(0);
    const firstActivityRef = useRef(true);
    useEffect(() => {
        if (firstActivityRef.current) {
            firstActivityRef.current = false;
            return;
        }
        const now = Date.now();
        if (now - lastActivityRefreshRef.current < ACTIVITY_REFRESH_MIN_MS)
            return;
        lastActivityRefreshRef.current = now;
        void refresh();
    }, [sessionList, refresh]);
    // Per-session cost map (host-priced + client fallback), fed to the row injector.
    const costMap = useMemo(() => buildCostMap(Object.values(sessionList), summary), [sessionList, summary]);
    // Keep the session-row chips in sync: the injector lives for the widget's
    // lifetime; cost updates flow through setCosts (idempotent re-sync).
    useEffect(() => {
        sessionRowCostInjector.start();
        return () => {
            sessionRowCostInjector.stop();
        };
    }, []);
    useEffect(() => {
        sessionRowCostInjector.setCosts(costMap);
    }, [costMap]);
    // Per-workspace aggregates for the heatmap.
    const rows = useMemo(() => aggregateRows(sessions, workspaces, costMap), [sessions, workspaces, costMap]);
    const maxTokens = Math.max(1, ...rows.map((row) => row.totalTokens));
    const totals = useMemo(() => rows.reduce((acc, row) => ({
        tokens: acc.tokens + row.totalTokens,
        cost: acc.cost + row.cost,
        sessions: acc.sessions + row.sessionIds.length,
    }), { tokens: 0, cost: 0, sessions: 0 }), [rows]);
    const balance = summary?.balance;
    // Rail mode: a single compact balance readout.
    if (!wide) {
        const label = balance?.error === undefined
            ? (balance?.total === undefined
                ? t("widget.loading")
                : formatBalance(balance.total))
            : "—";
        return (_jsx("span", { className: css.rail, title: balance?.error ??
                t("widget.balance", { amount: formatBalance(balance?.total) }), children: label }));
    }
    return (_jsxs("div", { className: css.root, children: [_jsxs("div", { className: css.balanceRow, children: [_jsx("span", { className: css.balanceValue, title: balance?.error, children: t("widget.balance", { amount: formatBalance(balance?.total) }) }), _jsx("span", { className: css.balanceState, children: balance?.error !== undefined
                            ? t("widget.unavailable")
                            : balance === undefined
                                ? t("widget.loading")
                                : t("widget.available") })] }), error !== undefined && (_jsx("div", { className: css.error, title: error, children: t("widget.error", { error }) })), rows.length === 0
                ? _jsx("div", { className: css.empty, children: t("widget.empty") })
                : (_jsx("div", { className: css.heatmap, role: "list", children: rows.map((row) => {
                        const detail = [
                            t("widget.tokens"),
                            `${formatTokens(row.tokens.uncachedInputTokens)} / ${formatTokens(row.tokens.outputTokens)} / ${formatTokens(row.tokens.cacheReadTokens)}`,
                            t("widget.cost"),
                            formatMoney(row.cost),
                            t("widget.sessions", { count: String(row.sessionIds.length) }),
                        ].join(" · ");
                        return (_jsxs("div", { className: css.row, role: "listitem", title: detail, children: [_jsx("span", { className: css.swatch, style: {
                                        background: heatColor(row.totalTokens / maxTokens),
                                    } }), _jsx("span", { className: css.name, children: row.workspaceId === undefined ? t("widget.ungrouped") : row.title }), _jsx("span", { className: css.tokens, children: formatTokens(row.totalTokens) }), _jsx("span", { className: css.cost, children: formatMoney(row.cost) })] }, row.workspaceId ?? "__ungrouped__"));
                    }) })), _jsxs("div", { className: css.totalRow, children: [_jsx("span", { children: t("widget.total") }), _jsxs("span", { children: [formatTokens(totals.tokens), " \u00B7", " ", t("widget.sessions", { count: String(totals.sessions) })] }), _jsx("span", { children: formatMoney(totals.cost) })] })] }));
}
