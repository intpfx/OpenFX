/**
 * dsh-usage-balance browser formatting helpers — pure display functions
 * shared by the footer widget and the session-row chips.
 * @module dsh-usage-balance/client/format
 */
/**
 * Compact token count: `517`, `12.2K`, `517K`, `1.2M`, `1.2B`
 * (one decimal under three digits, mirroring the stats strip).
 */
export function formatTokens(n) {
    if (!Number.isFinite(n) || n <= 0)
        return "0";
    for (const [div, suffix] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]]) {
        if (n >= div) {
            const v = n / div;
            return `${v >= 100 ? String(Math.round(v)) : v.toFixed(1)}${suffix}`;
        }
    }
    return String(Math.round(n));
}
/**
 * Compact money in CNY: `¥1,235` (≥100, no decimals), `¥12.34` (≥1),
 * `¥0.012` (below 1, three decimals). Non-finite values render `—`.
 */
export function formatMoney(value) {
    if (!Number.isFinite(value))
        return "—";
    const abs = Math.abs(value);
    const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 3;
    return `¥${value.toLocaleString("zh-CN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })}`;
}
/** Balance with two fixed decimals: `¥4.16`. */
export function formatBalance(value) {
    if (value === undefined || !Number.isFinite(value))
        return "—";
    return `¥${value.toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}
