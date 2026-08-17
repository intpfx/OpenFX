/**
 * dsh-usage-balance session-row cost chips — DOM-level augmentation of the
 * sidebar session list. The sidebar workspace browser renders its session
 * rows internally and exposes no per-row slot, so this injector:
 *
 * 1. observes the document for `[role="treeitem"]` rows (stable ARIA
 *    contract of the workspace browser);
 * 2. resolves each row's session id from its React fiber props (the row
 *    element carries the fiber; the tree node — `{ id, blank, updatedAt, … }`
 *    for sessions, `{ sessions: [] }` for workspace groups — sits a few
 *    frames up the return chain);
 * 3. renders a small cost chip before the row's time label.
 *
 * The chip markup is plain DOM (no React), keyed by `data-usage-balance`,
 * so re-syncs are idempotent and unload removes every chip.
 * @module dsh-usage-balance/client/session-row
 */
/**
 * Resolve the session id of a tree row by walking its React fiber chain.
 * Session tree nodes carry `id` + `updatedAt`; workspace group nodes carry a
 * `sessions` array instead and return undefined.
 */
export declare function sessionIdOfRow(row: HTMLElement): string | undefined;
/**
 * DOM injector for per-session cost chips. Call {@link start} once (widget
 * mount), {@link setCosts} whenever the cost map changes, and {@link stop}
 * on unload.
 */
export declare class SessionRowCostInjector {
    private readonly entries;
    private costs;
    private observer;
    private syncScheduled;
    /** Update the cost map and re-sync chips (cheap, batched per tick). */
    setCosts(costs: ReadonlyMap<string, number>): void;
    /** Start observing and run an initial scan. */
    start(): void;
    /** Stop observing and remove every chip. */
    stop(): void;
    private scheduleSync;
    /** Reconcile chips with the current DOM rows and cost map. */
    private scan;
    /** Render (or clear) the chip of one row. */
    private render;
}
/** Module-level singleton shared by the widget (one injector per page). */
export declare const sessionRowCostInjector: SessionRowCostInjector;
//# sourceMappingURL=session-row.d.ts.map