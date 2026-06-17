import { installUserscriptFetch } from './request'

type StorageValue = unknown
type StorageItems = Record<string, StorageValue>
interface StorageChange {
  oldValue?: StorageValue
  newValue?: StorageValue
}
type StorageChanges = Record<string, StorageChange>
type StorageChangeListener = (changes: StorageChanges, areaName: 'local') => void

interface GmApi {
  getValue?: (key: string, defaultValue?: StorageValue) => Promise<StorageValue> | StorageValue
  setValue?: (key: string, value: StorageValue) => Promise<void> | void
  deleteValue?: (key: string) => Promise<void> | void
  listValues?: () => Promise<string[]> | string[]
  openInTab?: (url: string, options?: { active?: boolean } | boolean) => unknown
}

const storagePrefix = 'bewlyscript:'
const listeners = new Set<StorageChangeListener>()

installUserscriptFetch()

function getGm(): GmApi | undefined {
  return (globalThis as { GM?: GmApi }).GM
}

function storageKey(key: string): string {
  return `${storagePrefix}${key}`
}

function localStorageAvailable(): boolean {
  const storage = globalThis.localStorage
  if (!storage)
    return false

  try {
    const probe = `${storagePrefix}probe`
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return true
  }
  catch {
    return false
  }
}

async function getRawValue(key: string): Promise<StorageValue | undefined> {
  const gm = getGm()
  if (gm?.getValue)
    return await gm.getValue(storageKey(key), undefined)

  if (!localStorageAvailable())
    return undefined

  const raw = globalThis.localStorage.getItem(storageKey(key))
  return raw == null ? undefined : JSON.parse(raw)
}

async function setRawValue(key: string, value: StorageValue): Promise<void> {
  const gm = getGm()
  if (gm?.setValue) {
    await gm.setValue(storageKey(key), value)
    return
  }

  if (localStorageAvailable())
    globalThis.localStorage.setItem(storageKey(key), JSON.stringify(value))
}

async function removeRawValue(key: string): Promise<void> {
  const gm = getGm()
  if (gm?.deleteValue) {
    await gm.deleteValue(storageKey(key))
    return
  }

  if (localStorageAvailable())
    globalThis.localStorage.removeItem(storageKey(key))
}

async function listRawKeys(): Promise<string[]> {
  const gm = getGm()
  if (gm?.listValues) {
    const keys = await gm.listValues()
    return keys
      .filter(key => key.startsWith(storagePrefix))
      .map(key => key.slice(storagePrefix.length))
  }

  if (!localStorageAvailable())
    return []

  const keys: string[] = []
  for (let index = 0; index < globalThis.localStorage.length; index += 1) {
    const key = globalThis.localStorage.key(index)
    if (key?.startsWith(storagePrefix))
      keys.push(key.slice(storagePrefix.length))
  }
  return keys
}

function emitStorageChange(changes: StorageChanges): void {
  if (Object.keys(changes).length === 0)
    return

  for (const listener of listeners)
    listener(changes, 'local')
}

function normalizeGetKeys(keys?: string | string[] | StorageItems | null): string[] | null {
  if (keys == null)
    return null

  if (typeof keys === 'string')
    return [keys]

  if (Array.isArray(keys))
    return keys

  return Object.keys(keys)
}

async function getStorageItems(keys?: string | string[] | StorageItems | null): Promise<StorageItems> {
  const normalizedKeys = normalizeGetKeys(keys)
  const targetKeys = normalizedKeys ?? await listRawKeys()
  const result: StorageItems = {}

  for (const key of targetKeys) {
    const value = await getRawValue(key)
    if (value === undefined && keys && typeof keys === 'object' && !Array.isArray(keys))
      result[key] = keys[key]
    else if (value !== undefined)
      result[key] = value
  }

  return result
}

async function setStorageItems(items: StorageItems): Promise<void> {
  const changes: StorageChanges = {}

  for (const [key, value] of Object.entries(items)) {
    const oldValue = await getRawValue(key)
    await setRawValue(key, value)
    changes[key] = { oldValue, newValue: value }
  }

  emitStorageChange(changes)
}

async function removeStorageItems(keys: string | string[]): Promise<void> {
  const targetKeys = Array.isArray(keys) ? keys : [keys]
  const changes: StorageChanges = {}

  for (const key of targetKeys) {
    const oldValue = await getRawValue(key)
    await removeRawValue(key)
    changes[key] = { oldValue }
  }

  emitStorageChange(changes)
}

function getRuntimeUrl(path: string): string {
  return path
}

async function sendRuntimeMessage(message: unknown): Promise<unknown> {
  const { dispatchRuntimeMessage } = await import('./api-dispatcher')
  return await dispatchRuntimeMessage(message as never)
}

function getUiLanguage(): string {
  const language = navigator.language || 'zh-CN'
  if (language.toLowerCase().startsWith('zh-cn'))
    return 'zh-CN'
  if (language.toLowerCase().startsWith('zh-tw'))
    return 'zh-TW'
  return language
}

const browser = {
  runtime: {
    getURL: getRuntimeUrl,
    sendMessage: sendRuntimeMessage,
    onInstalled: {
      addListener() {},
      removeListener() {},
    },
    onMessage: {
      addListener() {},
      removeListener() {},
    },
  },
  storage: {
    local: {
      get: getStorageItems,
      set: setStorageItems,
      remove: removeStorageItems,
    },
    onChanged: {
      addListener(listener: StorageChangeListener) {
        listeners.add(listener)
      },
      removeListener(listener: StorageChangeListener) {
        listeners.delete(listener)
      },
    },
  },
  i18n: {
    getUILanguage: getUiLanguage,
    async getAcceptLanguages() {
      return navigator.languages?.length ? [...navigator.languages] : [getUiLanguage()]
    },
  },
  tabs: {
    async create(options: { url?: string, active?: boolean }) {
      const url = options.url ?? 'about:blank'
      const gm = getGm()
      if (gm?.openInTab)
        return gm.openInTab(url, { active: options.active ?? true })

      return window.open(url, options.active === false ? '_blank' : '_self')
    },
    async query() {
      return [{ id: 1, index: 0, windowId: 1, active: true }]
    },
    async get() {
      return { id: 1, index: 0, windowId: 1, active: true }
    },
  },
  cookies: {
    async getAll() {
      return []
    },
  },
  webRequest: {
    onBeforeSendHeaders: {
      addListener() {},
      removeListener() {},
    },
  },
}

const { cookies, i18n, runtime, storage, tabs, webRequest } = browser

export default browser
export { browser, cookies, i18n, runtime, storage, tabs, webRequest }
