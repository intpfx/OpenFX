/** Sandboxed browser view with toolbar-owned navigation history. */
import { useEffect } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { IconGlobeOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { createBrowserViewStore } from './browser-store.ts'
import css from './BrowserView.module.css'

type BrowserStore = ReturnType<typeof createBrowserViewStore>
type BrowserViewProps = ConvViewProps & PropsStore<BrowserStore> & PropsLocale<'browser'>

const FRAME_SANDBOX = 'allow-forms allow-modals allow-popups allow-scripts'

/** Browser view registered into the session-scoped conversation view slot. */
export function BrowserView({ useStore, actions, t }: BrowserViewProps) {
  const { history, cursor, revision, loading, error } = useStore(state => state)
  const currentUrl = history[cursor] ?? null

  useEffect(() => {
    actions.setActive(true)
    return () => { actions.setActive(false) }
  }, [actions])

  return (
    <section className={css.root} data-conversation-composer-overlay="">
      <div className={css.viewport} data-browser-viewport="">
        {error !== null && (
          <div className={css.notice} role="alert">
            {t(`error.${error}`)}
          </div>
        )}
        {loading && <div className={css.status} role="status">{t('status.loading')}</div>}

        {currentUrl === null
          ? (
            <div className={css.empty}>
              <span className={css.emptyIcon}><IconGlobeOutline14 size={26} /></span>
              <h2>{t('empty.title')}</h2>
              <p>{t('empty.description')}</p>
              <small>{t('empty.limit')}</small>
            </div>
          )
          : (
            <iframe
              key={`${currentUrl}\u0000${revision}`}
              className={css.frame}
              title={t('frame.title')}
              src={currentUrl}
              sandbox={FRAME_SANDBOX}
              referrerPolicy="no-referrer"
              loading="eager"
              onLoad={actions.loaded}
              onErrorCapture={() => {
                actions.fail('frame')
              }}
            />
          )}
      </div>
    </section>
  )
}
