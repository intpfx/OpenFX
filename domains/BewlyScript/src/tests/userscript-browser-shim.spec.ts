import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import browser from '../userscript/browser-shim'

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

function installMockLocalStorage(): Storage {
  const storage = createMemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: storage,
  })
  return storage
}

describe('userscript browser shim', () => {
  beforeEach(() => {
    installMockLocalStorage()
    vi.restoreAllMocks()
  })

  afterAll(() => {
    if (originalLocalStorageDescriptor)
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorageDescriptor)
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

  it('keeps runtime URLs unchanged when extension resources are not bundled', () => {
    expect(browser.runtime.getURL('/dist/contentScripts/style.css')).toBe('/dist/contentScripts/style.css')
  })
})
