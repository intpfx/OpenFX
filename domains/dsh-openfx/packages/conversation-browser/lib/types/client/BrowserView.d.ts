import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import { createBrowserViewStore } from './browser-store.ts';
type BrowserStore = ReturnType<typeof createBrowserViewStore>;
type BrowserViewProps = ConvViewProps & PropsStore<BrowserStore> & PropsLocale<'browser'>;
/** Browser view registered into the session-scoped conversation view slot. */
export declare function BrowserView({ useStore, actions, t }: BrowserViewProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=BrowserView.d.ts.map