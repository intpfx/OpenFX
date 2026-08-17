/** Reasons an address cannot be opened by the embedded browser. */
export type BrowserAddressFailure = 'empty' | 'invalid' | 'credentials' | 'unsupported';
/** Result of normalizing user-entered browser text. */
export type BrowserAddressResult = {
    readonly ok: true;
    readonly url: string;
} | {
    readonly ok: false;
    readonly reason: BrowserAddressFailure;
};
/**
 * Normalize an address for the sandboxed browser frame.
 * @param value - user-entered address.
 * @returns an absolute HTTP(S) URL or a precise rejection reason.
 */
export declare function normalizeBrowserAddress(value: string): BrowserAddressResult;
//# sourceMappingURL=browser-address.d.ts.map