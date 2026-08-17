/** Per-session address and toolbar-owned navigation history. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { BrowserAddressFailure } from './browser-address.ts'

/** Failure surfaced by either address validation or the sandbox frame. */
export type BrowserError = BrowserAddressFailure | 'frame'

/** Browser view state owned by one session-scope slot entry. */
export interface BrowserViewState {
  active: boolean
  address: string
  history: string[]
  cursor: number
  revision: number
  loading: boolean
  error: BrowserError | null
}

type BrowserViewActions = {
  setActive: (draft: BrowserViewState, active: boolean) => void
  setAddress: (draft: BrowserViewState, address: string) => void
  navigate: (draft: BrowserViewState, url: string) => void
  back: (draft: BrowserViewState) => void
  forward: (draft: BrowserViewState) => void
  reload: (draft: BrowserViewState) => void
  loaded: (draft: BrowserViewState) => void
  fail: (draft: BrowserViewState, error: BrowserError) => void
}

function startLoading(draft: BrowserViewState): void {
  draft.error = null
  draft.loading = true
}

/**
 * Declare an exclusive browser store for one session view entry.
 * @returns the store handle consumed by the slot renderer.
 */
export function createBrowserViewStore(): EngineStoreHandle<BrowserViewState, BrowserViewActions> {
  return defineStore({
    init: () => ({
      active: false,
      address: '',
      history: [],
      cursor: -1,
      revision: 0,
      loading: false,
      error: null,
    }),
    actions: {
      setActive: (draft, active: boolean) => { draft.active = active },
      setAddress: (draft, address: string) => {
        draft.address = address
        draft.error = null
      },
      navigate: (draft, url: string) => {
        startLoading(draft)
        const current = draft.history[draft.cursor]
        draft.address = url
        if (current !== url) {
          draft.history.splice(draft.cursor + 1)
          draft.history.push(url)
          draft.cursor = draft.history.length - 1
        }
        draft.revision += 1
      },
      back: (draft) => {
        if (draft.cursor <= 0) return
        const target = draft.history[draft.cursor - 1]
        if (target === undefined) return
        startLoading(draft)
        draft.cursor -= 1
        draft.address = target
        draft.revision += 1
      },
      forward: (draft) => {
        if (draft.cursor >= draft.history.length - 1) return
        const target = draft.history[draft.cursor + 1]
        if (target === undefined) return
        startLoading(draft)
        draft.cursor += 1
        draft.address = target
        draft.revision += 1
      },
      reload: (draft) => {
        const current = draft.history[draft.cursor]
        if (current === undefined) return
        startLoading(draft)
        draft.address = current
        draft.revision += 1
      },
      loaded: (draft) => { draft.loading = false },
      fail: (draft, error: BrowserError) => {
        draft.loading = false
        draft.error = error
      },
    },
  })
}
