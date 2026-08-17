import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import { createBrowserViewStore } from './browser-store.ts';
type BrowserStore = ReturnType<typeof createBrowserViewStore>;
type BrowserAddressDockProps = PropsRuntime<'conversation.input.dock'> & PropsStore<BrowserStore> & PropsLocale<'browser'>;
/** Browser address controls shown only while the Browser conversation view is mounted. */
export declare function BrowserAddressDock({ useStore, actions, t }: BrowserAddressDockProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=BrowserAddressDock.d.ts.map