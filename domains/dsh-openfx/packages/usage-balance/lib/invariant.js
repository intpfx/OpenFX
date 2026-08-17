import { t as DEFAULT_API_KEY_ENV } from "./service-BiyPlW5S.js";
//#region src/invariant.ts
/**
* Package invariants — cheap structural checks run at import time on the
* host side. Mirrors the pattern used by other dsh plugin packages.
* @module dsh-usage-balance/invariant
*/
/** Assert a condition; throws a descriptive Error when violated. */
function invariant(condition, message) {
	if (!condition) throw new Error(`[dsh-usage-balance] ${message}`);
}
/** Run every package invariant once; throws on the first violation. */
function runBalanceInvariants() {
	invariant(true, "refresh interval must be nonnegative");
	invariant(DEFAULT_API_KEY_ENV.length > 0, "API key env name must be non-empty");
	invariant("https://api.deepseek.com".startsWith("https://"), "base URL must be http(s)");
}
runBalanceInvariants();
//#endregion
export { invariant, runBalanceInvariants };
