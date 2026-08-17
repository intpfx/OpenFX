import { BrowserAddressOverlay } from "./BrowserAddressOverlay.js";
import { BrowserView } from "./BrowserView.js";
import { createBrowserViewStore } from "./browser-store.js";
import { en, NS, zh } from "./locales.js";
/** Services required by the browser view registration. */
export const inject = ['slots', 'locale'];
/**
 * Register the browser dictionaries and session-scoped conversation tab.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'conversation-browser: dictionaries');
    const t = ctx.locale.bind(NS);
    const browserStore = createBrowserViewStore();
    ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'browser',
        order: 20,
        locale: NS,
        label: () => t('view.browser'),
        store: browserStore,
    }, BrowserView));
    ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: 'browser-address',
        order: 100,
        locale: NS,
        store: browserStore,
    }, BrowserAddressOverlay));
}
