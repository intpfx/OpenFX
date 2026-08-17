/** Sandboxed browser view with toolbar-owned navigation history. */
import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
  IconGlobeOutline14,
  IconRefreshOutline16,
  Input,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { normalizeBrowserAddress, type BrowserAddressFailure } from './browser-address.ts'
import { createBrowserViewStore } from './browser-store.ts'
import css from './BrowserView.module.css'

type BrowserStore = ReturnType<typeof createBrowserViewStore>
type BrowserViewProps = ConvViewProps & PropsStore<BrowserStore> & PropsLocale<'browser'>
type BrowserError = BrowserAddressFailure | 'frame'

const FRAME_SANDBOX = 'allow-forms allow-modals allow-popups allow-scripts'

function useComposerInputHeader(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const refresh = (): void => {
      setHost(document.querySelector<HTMLElement>('[data-conversation-input-header]'))
    }
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { observer.disconnect() }
  }, [])

  return host
}

/** Browser view registered into the session-scoped conversation view slot. */
export function BrowserView({ useStore, actions, t }: BrowserViewProps) {
  const { address, history, cursor, revision } = useStore(state => state)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<BrowserError | null>(null)
  const currentUrl = history[cursor] ?? null
  const canGoBack = cursor > 0
  const canGoForward = cursor >= 0 && cursor < history.length - 1
  const composerInputHeader = useComposerInputHeader()

  const navigate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = normalizeBrowserAddress(address)
    if (!result.ok) {
      setLoading(false)
      setError(result.reason)
      return
    }
    setError(null)
    setLoading(true)
    actions.navigate(result.url)
  }

  const move = (action: () => void) => {
    setError(null)
    setLoading(true)
    action()
  }

  const toolbar = (
    <form className={css.toolbar} role="toolbar" aria-label={t('toolbar.label')} onSubmit={navigate}>
      <Tooltip label={() => t('action.back')} side="bottom">
        <button
          className={css.iconButton}
          type="button"
          aria-label={t('action.back')}
          disabled={!canGoBack}
          onClick={() => { move(actions.back) }}
        >
          <IconChevronLeftOutline14 />
        </button>
      </Tooltip>
      <Tooltip label={() => t('action.forward')} side="bottom">
        <button
          className={css.iconButton}
          type="button"
          aria-label={t('action.forward')}
          disabled={!canGoForward}
          onClick={() => { move(actions.forward) }}
        >
          <IconChevronRightOutline14 />
        </button>
      </Tooltip>
      <Tooltip label={() => t('action.reload')} side="bottom">
        <button
          className={css.iconButton}
          type="button"
          aria-label={t('action.reload')}
          disabled={currentUrl === null}
          onClick={() => { move(actions.reload) }}
        >
          <IconRefreshOutline16 />
        </button>
      </Tooltip>
      <Input
        className={css.address ?? ''}
        icon={<IconGlobeOutline14 />}
        aria-label={t('address.label')}
        placeholder={t('address.placeholder')}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={address}
        onChange={(event) => {
          actions.setAddress(event.currentTarget.value)
          setError(null)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }}
      />
    </form>
  )

  return (
    <section
      className={`${css.root} ${composerInputHeader === null ? css.inline : ''}`}
      data-conversation-composer-overlay=""
    >
      {composerInputHeader === null ? toolbar : createPortal(toolbar, composerInputHeader)}
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
              onLoad={() => { setLoading(false) }}
              onErrorCapture={() => {
                setLoading(false)
                setError('frame')
              }}
            />
          )}
      </div>
    </section>
  )
}
