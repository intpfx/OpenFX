/** Per-session address and toolbar-owned navigation history. */
import { type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client';
import type { BrowserAddressFailure } from './browser-address.ts';
/** Failure surfaced by either address validation or the sandbox frame. */
export type BrowserError = BrowserAddressFailure | 'frame';
/** Browser view state owned by one session-scope slot entry. */
export interface BrowserViewState {
    active: boolean;
    address: string;
    history: string[];
    cursor: number;
    revision: number;
    loading: boolean;
    error: BrowserError | null;
}
type BrowserViewActions = {
    setActive: (draft: BrowserViewState, active: boolean) => void;
    setAddress: (draft: BrowserViewState, address: string) => void;
    navigate: (draft: BrowserViewState, url: string) => void;
    back: (draft: BrowserViewState) => void;
    forward: (draft: BrowserViewState) => void;
    reload: (draft: BrowserViewState) => void;
    loaded: (draft: BrowserViewState) => void;
    fail: (draft: BrowserViewState, error: BrowserError) => void;
};
/**
 * Declare an exclusive browser store for one session view entry.
 * @returns the store handle consumed by the slot renderer.
 */
export declare function createBrowserViewStore(): EngineStoreHandle<BrowserViewState, BrowserViewActions>;
export {};
//# sourceMappingURL=browser-store.d.ts.map