// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { normalizeBrowserAddress } from '../src/client/browser-address.ts'
import { createBrowserViewStore } from '../src/client/browser-store.ts'
import { BrowserView } from '../src/client/BrowserView.tsx'
import { en } from '../src/client/locales.ts'

const translate = (key: keyof typeof en): string => en[key]

function bindSnapshotSelector<State>(store: {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => State
}) {
  return <Selected,>(selector: (state: State) => Selected): Selected =>
    useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()))
}

afterEach(() => {
  cleanup()
  document.querySelector('[data-conversation-input-header]')?.remove()
})

beforeEach(() => {
  const inputHeader = document.createElement('div')
  inputHeader.setAttribute('data-conversation-input-header', '')
  document.body.appendChild(inputHeader)
})

describe('browser address parsing', () => {
  it('normalizes public and loopback addresses', () => {
    expect(normalizeBrowserAddress(' example.com/docs ')).toEqual({
      ok: true,
      url: 'https://example.com/docs',
    })
    expect(normalizeBrowserAddress('localhost:5173/demo')).toEqual({
      ok: true,
      url: 'http://localhost:5173/demo',
    })
    expect(normalizeBrowserAddress('127.0.0.1:4173')).toEqual({
      ok: true,
      url: 'http://127.0.0.1:4173/',
    })
    expect(normalizeBrowserAddress('example.com:8443/status')).toEqual({
      ok: true,
      url: 'https://example.com:8443/status',
    })
  })

  it('rejects empty, invalid, credential-bearing, and non-web addresses', () => {
    expect(normalizeBrowserAddress('')).toEqual({ ok: false, reason: 'empty' })
    expect(normalizeBrowserAddress('http://')).toEqual({ ok: false, reason: 'invalid' })
    expect(normalizeBrowserAddress('https://user:secret@example.com')).toEqual({
      ok: false,
      reason: 'credentials',
    })
    expect(normalizeBrowserAddress('javascript:alert(1)')).toEqual({
      ok: false,
      reason: 'unsupported',
    })
    expect(normalizeBrowserAddress('file:///tmp/demo.html')).toEqual({
      ok: false,
      reason: 'unsupported',
    })
  })
})

describe('browser view store', () => {
  it('owns address history, branch navigation, and reload revisions', () => {
    const store = createBrowserViewStore().create()
    store.actions.setAddress('first.example')
    store.actions.navigate('https://first.example/')
    store.actions.navigate('https://second.example/')
    expect(store.getSnapshot()).toMatchObject({
      address: 'https://second.example/',
      history: ['https://first.example/', 'https://second.example/'],
      cursor: 1,
      revision: 2,
    })

    store.actions.back()
    expect(store.getSnapshot()).toMatchObject({
      address: 'https://first.example/',
      cursor: 0,
      revision: 3,
    })
    store.actions.back()
    expect(store.getSnapshot().revision).toBe(3)

    store.actions.forward()
    expect(store.getSnapshot()).toMatchObject({
      address: 'https://second.example/',
      cursor: 1,
      revision: 4,
    })
    store.actions.forward()
    expect(store.getSnapshot().revision).toBe(4)

    store.actions.back()
    store.actions.navigate('https://branch.example/')
    expect(store.getSnapshot()).toMatchObject({
      history: ['https://first.example/', 'https://branch.example/'],
      cursor: 1,
      revision: 6,
    })

    store.actions.reload()
    expect(store.getSnapshot()).toMatchObject({
      address: 'https://branch.example/',
      revision: 7,
    })
    store.actions.navigate('https://branch.example/')
    expect(store.getSnapshot()).toMatchObject({
      history: ['https://first.example/', 'https://branch.example/'],
      revision: 8,
    })
  })
})

function mountBrowser() {
  const store = createBrowserViewStore().create()
  const standard = {
    sessionId: 'browser-view-test',
    useSession: (() => undefined),
    useSessions: (() => undefined),
    useWorkspaces: (() => undefined),
    useProjection: (() => undefined),
    inspect: null,
    onInspectDone: () => {},
  } as unknown as ConvViewProps
  const view = render(
    <BrowserView
      {...standard}
      useStore={bindSnapshotSelector(store)}
      actions={store.actions}
      t={translate as never}
    />,
  )
  return { store, view }
}

describe('browser view', () => {
  it('starts empty with an address toolbar and safe disabled controls', () => {
    const { view } = mountBrowser()
    const toolbar = screen.getByRole('toolbar', { name: 'Browser toolbar' })
    expect(toolbar.parentElement?.hasAttribute('data-conversation-input-header')).toBe(true)
    expect(view.container.querySelector('[data-browser-viewport]')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Open a page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Forward' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Reload' })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('link', { name: 'Open in new tab' })).toBeNull()
    expect(screen.queryByTitle('Browser content')).toBeNull()
  })

  it('keeps a usable inline toolbar when the host has no input-header seat', () => {
    document.querySelector('[data-conversation-input-header]')?.remove()
    const { view } = mountBrowser()
    const toolbar = screen.getByRole('toolbar', { name: 'Browser toolbar' })
    expect(view.container.contains(toolbar)).toBe(true)
    expect(toolbar.closest('[data-conversation-composer-overlay]')).toBeTruthy()
  })

  it('navigates, reloads, and moves through toolbar-owned history', () => {
    const { store } = mountBrowser()
    const address = screen.getByRole('textbox', { name: 'Address' })
    fireEvent.change(address, { target: { value: 'localhost:4173/demo' } })
    fireEvent.keyDown(address, { key: 'Enter' })

    const firstFrame = screen.getByTitle('Browser content')
    expect(firstFrame.parentElement?.hasAttribute('data-browser-viewport')).toBe(true)
    expect(firstFrame.getAttribute('src')).toBe('http://localhost:4173/demo')
    expect(firstFrame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(firstFrame.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(screen.getByRole('status').textContent).toBe('Loading page…')
    fireEvent.load(firstFrame)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open in new tab' })).toBeNull()

    fireEvent.change(address, { target: { value: 'example.com' } })
    fireEvent.submit(screen.getByRole('toolbar', { name: 'Browser toolbar' }))
    expect(screen.getByTitle('Browser content').getAttribute('src')).toBe('https://example.com/')
    expect(screen.getByRole('button', { name: 'Back' })).toHaveProperty('disabled', false)

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByTitle('Browser content').getAttribute('src')).toBe('http://localhost:4173/demo')
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveProperty(
      'value',
      'http://localhost:4173/demo',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    expect(screen.getByTitle('Browser content').getAttribute('src')).toBe('https://example.com/')

    const revision = store.getSnapshot().revision
    fireEvent.change(address, { target: { value: 'unfinished.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(store.getSnapshot()).toMatchObject({ address: 'https://example.com/', revision: revision + 1 })
  })

  it('reports address and frame failures without navigating to unsafe input', () => {
    mountBrowser()
    const address = screen.getByRole('textbox', { name: 'Address' })
    fireEvent.change(address, { target: { value: 'javascript:alert(1)' } })
    fireEvent.submit(screen.getByRole('toolbar', { name: 'Browser toolbar' }))
    expect(screen.getByRole('alert').textContent).toBe('Only HTTP and HTTPS addresses can be opened.')
    expect(screen.queryByTitle('Browser content')).toBeNull()

    fireEvent.change(address, { target: { value: 'https://example.com' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.submit(screen.getByRole('toolbar', { name: 'Browser toolbar' }))
    const frame = screen.getByTitle('Browser content')
    fireEvent.error(frame)
    expect(screen.getByRole('alert').textContent).toBe('This page could not be loaded here.')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
