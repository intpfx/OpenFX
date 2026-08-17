/** Address bar rendered inside the host's public composer overlay slot. */
import type { FormEvent } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
  IconGlobeOutline14,
  IconRefreshOutline16,
  Input,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { normalizeBrowserAddress } from './browser-address.ts'
import { createBrowserViewStore } from './browser-store.ts'
import css from './BrowserView.module.css'

type BrowserStore = ReturnType<typeof createBrowserViewStore>
type BrowserAddressOverlayProps = PropsRuntime<'conversation.input.overlay'>
  & PropsStore<BrowserStore>
  & PropsLocale<'browser'>

/** Browser address controls shown inside the composer card while the Browser view is mounted. */
export function BrowserAddressOverlay({ useStore, actions, t }: BrowserAddressOverlayProps) {
  const { active, address, history, cursor } = useStore(state => state)
  const currentUrl = history[cursor] ?? null
  const canGoBack = cursor > 0
  const canGoForward = cursor >= 0 && cursor < history.length - 1

  if (!active) return null

  const navigate = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const result = normalizeBrowserAddress(address)
    if (!result.ok) {
      actions.fail(result.reason)
      return
    }
    actions.navigate(result.url)
  }

  return (
    <div className={css.addressOverlay} data-browser-address-overlay="">
      <form className={css.toolbar} role="toolbar" aria-label={t('toolbar.label')} onSubmit={navigate}>
        <Tooltip label={() => t('action.back')} side="bottom">
          <button
            className={css.iconButton}
            type="button"
            aria-label={t('action.back')}
            disabled={!canGoBack}
            onClick={actions.back}
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
            onClick={actions.forward}
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
            onClick={actions.reload}
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
          onChange={(event) => { actions.setAddress(event.currentTarget.value) }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }}
        />
      </form>
    </div>
  )
}
