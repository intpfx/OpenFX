/** Per-session address and toolbar-owned navigation history. */
import { type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client';
/** Browser view state owned by one session-scope slot entry. */
export interface BrowserViewState {
    address: string;
    history: string[];
    cursor: number;
    revision: number;
}
type BrowserViewActions = {
    setAddress: (draft: BrowserViewState, address: string) => void;
    navigate: (draft: BrowserViewState, url: string) => void;
    back: (draft: BrowserViewState) => void;
    forward: (draft: BrowserViewState) => void;
    reload: (draft: BrowserViewState) => void;
};
/**
 * Declare an exclusive browser store for one session view entry.
 * @returns the store handle consumed by the slot renderer.
 */
export declare function createBrowserViewStore(): EngineStoreHandle<BrowserViewState, BrowserViewActions>;
export {};
//# sourceMappingURL=browser-store.d.ts.map