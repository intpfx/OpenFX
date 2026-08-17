import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import { createBrowserViewStore } from './browser-store.ts';
type BrowserStore = ReturnType<typeof createBrowserViewStore>;
type BrowserAddressOverlayProps = PropsRuntime<'conversation.input.overlay'> & PropsStore<BrowserStore> & PropsLocale<'browser'>;
/** Browser address controls shown inside the composer card while the Browser view is mounted. */
export declare function BrowserAddressOverlay({ useStore, actions, t }: BrowserAddressOverlayProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=BrowserAddressOverlay.d.ts.map