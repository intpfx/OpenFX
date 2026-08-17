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
import { formatMoney } from "./format.js";
/** Selector for sidebar tree rows (session and workspace rows alike). */
const ROW_SELECTOR = '[role="treeitem"]';
/** Marker on chip elements we own. */
const CHIP_ATTR = "data-usage-balance-chip";
/** How many fiber frames to walk up before giving up on a row. */
const MAX_FIBER_DEPTH = 12;
/**
 * Resolve the session id of a tree row by walking its React fiber chain.
 * Session tree nodes carry `id` + `updatedAt`; workspace group nodes carry a
 * `sessions` array instead and return undefined.
 */
export function sessionIdOfRow(row) {
    const fiberKey = Object.keys(row).find((key) => key.startsWith("__reactFiber$"));
    if (fiberKey === undefined)
        return undefined;
    let fiber = row[fiberKey];
    for (let depth = 0; fiber !== undefined && depth < MAX_FIBER_DEPTH; depth++) {
        const props = fiber.memoizedProps;
        const node = props?.node;
        if (node !== undefined && typeof node.id === "string" && "updatedAt" in node) {
            return node.id;
        }
        fiber = fiber.return;
    }
    return undefined;
}
/** Find the time label span of a session row (the chip anchors before it). */
function timeSpanOf(row) {
    const children = row.children;
    // Row layout: [status slot?] [title] [time] [row actions]. The time label
    // is the last-but-one child when row actions exist, the last child
    // otherwise; a blank row (no time) returns null.
    if (children.length < 2)
        return null;
    const candidate = children[children.length - 2];
    return candidate instanceof HTMLSpanElement ? candidate : null;
}
/**
 * DOM injector for per-session cost chips. Call {@link start} once (widget
 * mount), {@link setCosts} whenever the cost map changes, and {@link stop}
 * on unload.
 */
export class SessionRowCostInjector {
    entries = new Map();
    costs = new Map();
    observer;
    syncScheduled = false;
    /** Update the cost map and re-sync chips (cheap, batched per tick). */
    setCosts(costs) {
        this.costs = new Map(costs);
        this.scheduleSync();
    }
    /** Start observing and run an initial scan. */
    start() {
        if (this.observer !== undefined)
            return;
        this.observer = new MutationObserver(() => this.scheduleSync());
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.scheduleSync();
    }
    /** Stop observing and remove every chip. */
    stop() {
        this.observer?.disconnect();
        this.observer = undefined;
        for (const entry of this.entries.values())
            entry.chip?.remove();
        this.entries.clear();
        this.costs.clear();
        this.syncScheduled = false;
    }
    scheduleSync() {
        if (this.syncScheduled)
            return;
        this.syncScheduled = true;
        queueMicrotask(() => {
            this.syncScheduled = false;
            this.scan();
        });
    }
    /** Reconcile chips with the current DOM rows and cost map. */
    scan() {
        const seen = new Set();
        for (const element of document.querySelectorAll(ROW_SELECTOR)) {
            if (!(element instanceof HTMLElement))
                continue;
            seen.add(element);
            let entry = this.entries.get(element);
            if (entry === undefined) {
                const sessionId = sessionIdOfRow(element);
                if (sessionId === undefined)
                    continue;
                entry = { row: element, sessionId, chip: null };
                this.entries.set(element, entry);
            }
            this.render(entry);
        }
        for (const [row, entry] of this.entries) {
            if (!seen.has(row) || !row.isConnected) {
                entry.chip?.remove();
                this.entries.delete(row);
            }
        }
    }
    /** Render (or clear) the chip of one row. */
    render(entry) {
        const cost = this.costs.get(entry.sessionId);
        if (cost === undefined || cost <= 0 || !Number.isFinite(cost)) {
            entry.chip?.remove();
            entry.chip = null;
            return;
        }
        if (entry.chip === null) {
            const chip = document.createElement("span");
            chip.setAttribute(CHIP_ATTR, "");
            // Spacing and look are set once at creation (inline, self-contained):
            // the row uses gap:0, so the chip needs its own margins to keep clear
            // of the title and the time label; later updates only touch text.
            chip.style.margin = "0 6px";
            chip.style.fontSize = "11px";
            chip.style.lineHeight = "14px";
            chip.style.color = "var(--dsw-alias-label-caption, #999)";
            chip.style.fontVariantNumeric = "tabular-nums";
            chip.style.whiteSpace = "nowrap";
            const anchor = timeSpanOf(entry.row);
            if (anchor !== null) {
                entry.row.insertBefore(chip, anchor);
            }
            else {
                entry.row.appendChild(chip);
            }
            entry.chip = chip;
        }
        const text = formatMoney(cost);
        if (entry.chip.textContent !== text)
            entry.chip.textContent = text;
    }
}
/** Module-level singleton shared by the widget (one injector per page). */
export const sessionRowCostInjector = new SessionRowCostInjector();
