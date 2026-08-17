/** Per-session address and toolbar-owned navigation history. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Browser view state owned by one session-scope slot entry. */
export interface BrowserViewState {
  address: string
  history: string[]
  cursor: number
  revision: number
}

type BrowserViewActions = {
  setAddress: (draft: BrowserViewState, address: string) => void
  navigate: (draft: BrowserViewState, url: string) => void
  back: (draft: BrowserViewState) => void
  forward: (draft: BrowserViewState) => void
  reload: (draft: BrowserViewState) => void
}

/**
 * Declare an exclusive browser store for one session view entry.
 * @returns the store handle consumed by the slot renderer.
 */
export function createBrowserViewStore(): EngineStoreHandle<BrowserViewState, BrowserViewActions> {
  return defineStore({
    init: () => ({ address: '', history: [], cursor: -1, revision: 0 }),
    actions: {
      setAddress: (draft, address: string) => { draft.address = address },
      navigate: (draft, url: string) => {
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
        draft.cursor -= 1
        draft.address = target
        draft.revision += 1
      },
      forward: (draft) => {
        if (draft.cursor >= draft.history.length - 1) return
        const target = draft.history[draft.cursor + 1]
        if (target === undefined) return
        draft.cursor += 1
        draft.address = target
        draft.revision += 1
      },
      reload: (draft) => {
        const current = draft.history[draft.cursor]
        if (current === undefined) return
        draft.address = current
        draft.revision += 1
      },
    },
  })
}
