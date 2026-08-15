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
export declare const ZERO_TOKENS: WorkspaceTokens;
/** Sum two token buckets into a fresh object. */
export declare function sumTokens(
  a: WorkspaceTokens,
  b: WorkspaceTokens,
): WorkspaceTokens;
/** Total of the four buckets (the heatmap magnitude). */
export declare function totalOf(tokens: WorkspaceTokens): number;
/** Session ids that belong to no workspace (and are not archived). */
export declare function ungroupedSessionIds(
  allSessionIds: readonly string[],
  workspaces: readonly {
    sessionIds: readonly string[];
  }[],
  archivedSessionIds: readonly string[],
): string[];
/** Options for {@link aggregateWorkspaces}. */
export interface AggregateOptions {
  /** Token buckets per session id; absent sessions contribute zero. */
  usageOf: (sessionId: string) => WorkspaceTokens | undefined;
  /** Estimated cost per session id (host-priced); absent = unpriced. */
  costOf: (sessionId: string) => number | undefined;
}
/**
 * Aggregate per-workspace token usage and cost, in input order, followed by
 * one ungrouped bucket when such sessions exist.
 * @param workspaces - workspace rows with their session membership.
 * @param ungroupedIds - sessions belonging to no workspace (see
 *   {@link ungroupedSessionIds}).
 * @param opts - per-session reads.
 */
export declare function aggregateWorkspaces(
  workspaces: readonly {
    id: string;
    title: string;
    sessionIds: readonly string[];
  }[],
  ungroupedIds: readonly string[],
  opts: AggregateOptions,
): WorkspaceAggregate[];
//# sourceMappingURL=aggregate.d.ts.map
