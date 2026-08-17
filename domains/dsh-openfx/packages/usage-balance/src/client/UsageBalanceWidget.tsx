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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type { SessionListState } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import {
  aggregateWorkspaces,
  ungroupedSessionIds,
  type WorkspaceAggregate,
} from "../aggregate.ts";
import { costOfUsage, FLASH_COST_CONFIG } from "../cost.ts";
import type { BalanceView, SessionCost } from "../service.ts";
import { formatBalance, formatMoney, formatTokens } from "./format.ts";
import { NS } from "./locales.ts";
import { sessionRowCostInjector } from "./session-row.ts";
import css from "./widget.module.css";

/** Host summary response (same-origin JSON). */
export interface UsageBalanceSummary {
  balance: BalanceView;
  costs: { sessions: Record<string, SessionCost>; pricedAt: number };
}

/** Poll interval for the host summary. */
export const POLL_MS = 30_000;

/** Minimum gap between activity-triggered summary refreshes (streaming turns
 * update projections continuously, so this keeps the host from being
 * hammered while the widget still reacts within seconds of new usage). */
export const ACTIVITY_REFRESH_MIN_MS = 10_000;

/** Same-origin JSON fetch helper. */
async function summaryFetch(): Promise<UsageBalanceSummary> {
  const response = await fetch("/api/usage-balance/summary");
  if (!response.ok) {
    throw new Error(`usage-balance summary failed: ${response.status}`);
  }
  return (await response.json()) as UsageBalanceSummary;
}

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
export function buildCostMap(
  sessions: readonly SessionRowLike[],
  summary: UsageBalanceSummary | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  const hostCosts = summary?.costs?.sessions ?? {};
  for (const session of sessions) {
    if (session.blank) continue;
    const host = hostCosts[session.id];
    if (host !== undefined && Number.isFinite(host.cost)) {
      map.set(session.id, host.cost);
      continue;
    }
    const usage = session.projectionValues?.tokenUsage;
    if (usage !== undefined) {
      map.set(
        session.id,
        costOfUsage({
          inputTokens: usage.uncachedInputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
        }, FLASH_COST_CONFIG),
      );
    }
  }
  return map;
}

/** Heatmap fill color for one row, by its share of the largest row. */
export function heatColor(share: number): string {
  const clamped = Math.max(0, Math.min(1, share));
  return `hsla(210, 70%, 50%, ${(0.12 + 0.88 * clamped).toFixed(3)})`;
}

/** Aggregate rows with the ungrouped bucket merged in (stable input order). */
export function aggregateRows(
  sessions: SessionListState,
  workspaces: {
    items: readonly {
      workspaceId: string;
      title: string;
      sessionIds: readonly string[];
    }[];
    archivedSessionIds: readonly string[];
  },
  costMap: ReadonlyMap<string, number>,
): WorkspaceAggregate[] {
  const byId = sessions.byId as Record<
    string,
    {
      projectionValues?: {
        tokenUsage?: {
          uncachedInputTokens: number;
          outputTokens: number;
          cacheReadTokens: number;
          cacheWriteTokens: number;
        };
      };
    } | undefined
  >;
  const usageOf = (sessionId: string) => byId[sessionId]?.projectionValues?.tokenUsage;
  const costOf = (sessionId: string) => costMap.get(sessionId);
  const ungrouped = ungroupedSessionIds(
    sessions.ids,
    workspaces.items,
    workspaces.archivedSessionIds,
  );
  return aggregateWorkspaces(
    workspaces.items.map((workspace) => ({
      id: workspace.workspaceId,
      title: workspace.title,
      sessionIds: workspace.sessionIds,
    })),
    ungrouped,
    { usageOf, costOf },
  );
}

/** Composed props of the footer widget (owner share + global kit + locale). */
export type UsageBalanceWidgetProps =
  & PropsRuntime<"sidebar.footer.action">
  & PropsLocale<typeof NS>;

/** The footer widget component. */
export function UsageBalanceWidget(
  props: UsageBalanceWidgetProps,
) {
  const { wide, useSessions, useWorkspaces, t } = props;
  const sessions = useSessions((state) => state);
  const workspaces = useWorkspaces((state) => state);
  const [summary, setSummary] = useState<UsageBalanceSummary | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setError(undefined);
      setSummary(await summaryFetch());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  // The per-session rows (projection values included) — session activity
  // flows through this reference, driving the activity-triggered refresh.
  const sessionList = sessions.byId;

  // Poll the host summary; re-run the initial fetch after failures.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = async (): Promise<void> => {
      if (!alive) return;
      try {
        setError(undefined);
        const next = await summaryFetch();
        if (alive) setSummary(next);
      } catch (cause) {
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
      if (timer !== undefined) clearInterval(timer);
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
    if (now - lastActivityRefreshRef.current < ACTIVITY_REFRESH_MIN_MS) return;
    lastActivityRefreshRef.current = now;
    void refresh();
  }, [sessionList, refresh]);

  // Per-session cost map (host-priced + client fallback), fed to the row injector.
  const costMap = useMemo(
    () => buildCostMap(Object.values(sessionList), summary),
    [sessionList, summary],
  );

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
  const rows = useMemo(
    () => aggregateRows(sessions, workspaces, costMap),
    [sessions, workspaces, costMap],
  );
  const maxTokens = Math.max(1, ...rows.map((row) => row.totalTokens));
  const totals = useMemo(() =>
    rows.reduce(
      (acc, row) => ({
        tokens: acc.tokens + row.totalTokens,
        cost: acc.cost + row.cost,
        sessions: acc.sessions + row.sessionIds.length,
      }),
      { tokens: 0, cost: 0, sessions: 0 },
    ), [rows]);

  const balance = summary?.balance;

  // Rail mode: a single compact balance readout.
  if (!wide) {
    const label = balance?.error === undefined
      ? (balance?.total === undefined
        ? t("widget.loading")
        : formatBalance(balance.total))
      : "—";
    return (
      <span
        className={css.rail}
        data-usage-balance-value
        title={balance?.error ??
          t("widget.balance", { amount: formatBalance(balance?.total) })}
      >
        {label}
      </span>
    );
  }

  return (
    <div className={css.root} data-usage-balance-root>
      <div className={css.balanceRow}>
        <span
          className={css.balanceValue}
          data-usage-balance-value
          title={balance?.error}
        >
          {t("widget.balance", { amount: formatBalance(balance?.total) })}
        </span>
        <span className={css.balanceState}>
          {balance?.error !== undefined
            ? t("widget.unavailable")
            : balance === undefined
            ? t("widget.loading")
            : t("widget.available")}
        </span>
      </div>
      {error !== undefined && (
        <div className={css.error} title={error}>
          {t("widget.error", { error })}
        </div>
      )}
      {rows.length === 0
        ? <div className={css.empty}>{t("widget.empty")}</div>
        : (
          <ul className={css.heatmap}>
            {rows.map((row) => {
              const detail = [
                t("widget.tokens"),
                `${formatTokens(row.tokens.uncachedInputTokens)} / ${
                  formatTokens(row.tokens.outputTokens)
                } / ${formatTokens(row.tokens.cacheReadTokens)}`,
                t("widget.cost"),
                formatMoney(row.cost),
                t("widget.sessions", { count: String(row.sessionIds.length) }),
              ].join(" · ");
              return (
                <li
                  key={row.workspaceId ?? "__ungrouped__"}
                  className={css.row}
                  data-usage-balance-workspace-row
                  title={detail}
                >
                  <span
                    className={css.swatch}
                    style={{
                      background: heatColor(row.totalTokens / maxTokens),
                    }}
                  />
                  <span className={css.name} data-usage-balance-workspace-name>
                    {row.workspaceId === undefined ? t("widget.ungrouped") : row.title}
                  </span>
                  <span className={css.tokens}>
                    {formatTokens(row.totalTokens)}
                  </span>
                  <span className={css.cost} data-usage-balance-workspace-cost>
                    {formatMoney(row.cost)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      <div className={css.totalRow}>
        <span>{t("widget.total")}</span>
        <span>
          {formatTokens(totals.tokens)} ·{" "}
          {t("widget.sessions", { count: String(totals.sessions) })}
        </span>
        <span>{formatMoney(totals.cost)}</span>
      </div>
    </div>
  );
}
