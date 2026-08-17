/** Browser conversation-view plugin. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { BrowserAddressDock } from './BrowserAddressDock.tsx'
import { BrowserView } from './BrowserView.tsx'
import { createBrowserViewStore } from './browser-store.ts'
import { en, NS, zh } from './locales.ts'

/** Services required by the browser view registration. */
export const inject = ['slots', 'locale']

/**
 * Register the browser dictionaries and session-scoped conversation tab.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'conversation-browser: dictionaries')
  const t = ctx.locale.bind(NS)
  const browserStore = createBrowserViewStore()
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'browser',
    order: 20,
    locale: NS,
    label: () => t('view.browser'),
    store: browserStore,
  }, BrowserView))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'browser-address',
    order: 100,
    locale: NS,
    store: browserStore,
  }, BrowserAddressDock))
}
