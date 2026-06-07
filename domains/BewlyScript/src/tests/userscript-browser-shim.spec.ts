import { beforeEach, describe, expect, it, vi } from 'vitest'

import browser from '../userscript/browser-shim'

describe('userscript browser shim', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('stores values through localStorage when GM value APIs are missing', async () => {
    await browser.storage.local.set({ settings: '{"theme":"dark"}' })

    await expect(browser.storage.local.get('settings')).resolves.toEqual({
      settings: '{"theme":"dark"}',
    })
  })

  it('emits same-page storage change events', async () => {
    const listener = vi.fn()
    browser.storage.onChanged.addListener(listener)

    await browser.storage.local.set({ settings: 'next' })
    await browser.storage.local.remove('settings')

    expect(listener).toHaveBeenCalledWith({
      settings: {
        oldValue: undefined,
        newValue: 'next',
      },
    }, 'local')
    expect(listener).toHaveBeenCalledWith({
      settings: {
        oldValue: 'next',
      },
    }, 'local')

    browser.storage.onChanged.removeListener(listener)
  })

  it('resolves bundled resource URLs', () => {
    ;(globalThis as { __BEWLYSCRIPT_RESOURCES__?: Record<string, string> })
      .__BEWLYSCRIPT_RESOURCES__ = {
        'assets/loading.gif': 'data:image/gif;base64,abc',
      }

    expect(browser.runtime.getURL('/assets/loading.gif')).toBe('data:image/gif;base64,abc')
  })
})
