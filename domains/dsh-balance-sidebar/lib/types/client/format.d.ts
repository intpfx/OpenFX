/**
 * dsh-balance-sidebar browser formatting helpers — pure display functions
 * shared by the footer widget and the session-row chips.
 * @module dsh-balance-sidebar/client/format
 */
/**
 * Compact token count: `517`, `12.2K`, `517K`, `1.2M`, `1.2B`
 * (one decimal under three digits, mirroring the stats strip).
 */
export declare function formatTokens(n: number): string;
/**
 * Compact money in CNY: `¥1,235` (≥100, no decimals), `¥12.34` (≥1),
 * `¥0.012` (below 1, three decimals). Non-finite values render `—`.
 */
export declare function formatMoney(value: number): string;
/** Balance with two fixed decimals: `¥4.16`. */
export declare function formatBalance(value: number | undefined): string;
//# sourceMappingURL=format.d.ts.map
