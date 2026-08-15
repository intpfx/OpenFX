/**
 * dsh-balance-sidebar workspace aggregation — pure token/cost math shared by
 * the host and the browser half. The browser folds each session's live
 * `tokenUsage` projection (and the host's per-session cost map) into one
 * aggregate row per workspace, plus an "ungrouped" bucket for sessions that
 * belong to no workspace. Everything here is a pure function so it is
 * unit-testable without a host or a DOM.
 * @module dsh-balance-sidebar/aggregate
 */

/** The four disjoint billing buckets of one session (mirror of TokenUsageProjection). */
export interface WorkspaceTokens {
  uncachedInputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** One aggregated row (a workspace or the ungrouped bucket). */
export interface WorkspaceAggregate {
  /** Workspace id; undefined for the ungrouped bucket. */
  workspaceId: string | undefined;
  /** Display title (workspace title, or the ungrouped label). */
  title: string;
  /** Member session ids in input order. */
  sessionIds: string[];
  /** Summed billing buckets over the member sessions. */
  tokens: WorkspaceTokens;
  /** Sum of the four buckets. */
  totalTokens: number;
  /** Summed estimated cost over member sessions (0 while no cost is known). */
  cost: number;
  /** How many member sessions contributed a known cost. */
  pricedSessions: number;
}

/** Zeroed token buckets. */
export const ZERO_TOKENS: WorkspaceTokens = {
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** Sum two token buckets into a fresh object. */
export function sumTokens(
  a: WorkspaceTokens,
  b: WorkspaceTokens,
): WorkspaceTokens {
  return {
    uncachedInputTokens: a.uncachedInputTokens + b.uncachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/** Total of the four buckets (the heatmap magnitude). */
export function totalOf(tokens: WorkspaceTokens): number {
  return tokens.uncachedInputTokens + tokens.outputTokens +
    tokens.cacheReadTokens + tokens.cacheWriteTokens;
}

/** Session ids that belong to no workspace (and are not archived). */
export function ungroupedSessionIds(
  allSessionIds: readonly string[],
  workspaces: readonly { sessionIds: readonly string[] }[],
  archivedSessionIds: readonly string[],
): string[] {
  const archived = new Set(archivedSessionIds);
  const assigned = new Set<string>();
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) assigned.add(id);
  }
  return allSessionIds.filter((id) => !assigned.has(id) && !archived.has(id));
}

/** Options for {@link aggregateWorkspaces}. */
export interface AggregateOptions {
  /** Token buckets per session id; absent sessions contribute zero. */
  usageOf: (sessionId: string) => WorkspaceTokens | undefined;
  /** Estimated cost per session id (host-priced); absent = unpriced. */
  costOf: (sessionId: string) => number | undefined;
}

/** Fold one aggregate row from a workspace's session ids. */
function foldSessionIds(
  sessionIds: readonly string[],
  opts: AggregateOptions,
): { tokens: WorkspaceTokens; cost: number; pricedSessions: number } {
  let tokens = ZERO_TOKENS;
  let cost = 0;
  let pricedSessions = 0;
  for (const id of sessionIds) {
    const usage = opts.usageOf(id);
    if (usage !== undefined) tokens = sumTokens(tokens, usage);
    const sessionCost = opts.costOf(id);
    if (typeof sessionCost === "number" && Number.isFinite(sessionCost)) {
      cost += sessionCost;
      pricedSessions += 1;
    }
  }
  return { tokens, cost, pricedSessions };
}

/**
 * Aggregate per-workspace token usage and cost, in input order, followed by
 * one ungrouped bucket when such sessions exist.
 * @param workspaces - workspace rows with their session membership.
 * @param ungroupedIds - sessions belonging to no workspace (see
 *   {@link ungroupedSessionIds}).
 * @param opts - per-session reads.
 */
export function aggregateWorkspaces(
  workspaces: readonly {
    id: string;
    title: string;
    sessionIds: readonly string[];
  }[],
  ungroupedIds: readonly string[],
  opts: AggregateOptions,
): WorkspaceAggregate[] {
  const rows: WorkspaceAggregate[] = workspaces.map((workspace) => {
    const { tokens, cost, pricedSessions } = foldSessionIds(
      workspace.sessionIds,
      opts,
    );
    return {
      workspaceId: workspace.id,
      title: workspace.title,
      sessionIds: [...workspace.sessionIds],
      tokens,
      totalTokens: totalOf(tokens),
      cost,
      pricedSessions,
    };
  });
  if (ungroupedIds.length > 0) {
    const { tokens, cost, pricedSessions } = foldSessionIds(ungroupedIds, opts);
    rows.push({
      workspaceId: undefined,
      title: "",
      sessionIds: [...ungroupedIds],
      tokens,
      totalTokens: totalOf(tokens),
      cost,
      pricedSessions,
    });
  }
  return rows;
}
