// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply, name as nodeName } from '../src/index.ts'
import * as BrowserInvariant from '../src/invariant.ts'

describe('browser plugin wiring', () => {
  it('shares one session store between the browser view and its in-card input overlay', () => {
    const registrations: Record<string, unknown>[] = []
    const dispose = vi.fn()
    const ctx = {
      effect: (mount: () => unknown) => mount(),
      locale: {
        register: () => dispose,
        bind: () => (key: string) => key === 'view.browser' ? '浏览器' : key,
      },
      slots: {
        inject: (_name: string, mount: () => unknown) => mount(),
        register: (options: Record<string, unknown>) => {
          registrations.push(options)
          return dispose
        },
      },
    }

    expect(inject).toEqual(['slots', 'locale'])
    apply(ctx as never)
    expect(registrations).toHaveLength(2)
    const view = registrations.find(registration => registration.name === 'conversation.view')
    const overlay = registrations.find(registration => registration.name === 'conversation.input.overlay')
    expect(view).toMatchObject({ id: 'browser', order: 20, locale: 'browser' })
    expect(overlay).toMatchObject({ id: 'browser-address', order: 100, locale: 'browser' })
    expect((view?.label as () => string)()).toBe('浏览器')
    expect(view?.store).toBe(overlay?.store)
    const store = view?.store as {
      create: (scope: string) => { getSnapshot: () => unknown }
      spec: { init: unknown; actions: unknown }
    }
    expect(store.spec.init).toBeTypeOf('function')
    expect(store.spec.actions).toBeTypeOf('object')
    expect(store.create('browser-test').getSnapshot()).toMatchObject({ cursor: -1, history: [] })
  })

  it('has an empty host half and reserves invariant ownership', async () => {
    expect(nodeName).toBe('conversation-browser')
    nodeApply()
    const register = vi.fn(() => () => {})
    await expect(BrowserInvariant.apply({ invariants: { register } } as never)).resolves.toBeTypeOf(
      'function',
    )
    expect(register).toHaveBeenCalledWith('dsh-conversation-browser', expect.any(Function))
  })
})
