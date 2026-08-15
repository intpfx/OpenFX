/**
 * dsh-balance-sidebar workspace aggregation — pure token/cost math shared by
 * the host and the browser half. The browser folds each session's live
 * `tokenUsage` projection (and the host's per-session cost map) into one
 * aggregate row per workspace, plus an "ungrouped" bucket for sessions that
 * belong to no workspace. Everything here is a pure function so it is
 * unit-testable without a host or a DOM.
 * @module dsh-balance-sidebar/aggregate
 */
/** Zeroed token buckets. */
export const ZERO_TOKENS = {
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
};
/** Sum two token buckets into a fresh object. */
export function sumTokens(a, b) {
    return {
        uncachedInputTokens: a.uncachedInputTokens + b.uncachedInputTokens,
        outputTokens: a.outputTokens + b.outputTokens,
        cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
        cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    };
}
/** Total of the four buckets (the heatmap magnitude). */
export function totalOf(tokens) {
    return tokens.uncachedInputTokens + tokens.outputTokens +
        tokens.cacheReadTokens + tokens.cacheWriteTokens;
}
/** Session ids that belong to no workspace (and are not archived). */
export function ungroupedSessionIds(allSessionIds, workspaces, archivedSessionIds) {
    const archived = new Set(archivedSessionIds);
    const assigned = new Set();
    for (const workspace of workspaces) {
        for (const id of workspace.sessionIds)
            assigned.add(id);
    }
    return allSessionIds.filter((id) => !assigned.has(id) && !archived.has(id));
}
/** Fold one aggregate row from a workspace's session ids. */
function foldSessionIds(sessionIds, opts) {
    let tokens = ZERO_TOKENS;
    let cost = 0;
    let pricedSessions = 0;
    for (const id of sessionIds) {
        const usage = opts.usageOf(id);
        if (usage !== undefined)
            tokens = sumTokens(tokens, usage);
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
export function aggregateWorkspaces(workspaces, ungroupedIds, opts) {
    const rows = workspaces.map((workspace) => {
        const { tokens, cost, pricedSessions } = foldSessionIds(workspace.sessionIds, opts);
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
