import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { mountBewlyApp } from '~/contentScripts/mount-app'

const TestRoot = defineComponent({
  name: 'TestRoot',
  setup: () => () => h('p', { 'data-testid': 'mounted-root' }, 'mounted'),
})

describe('mountBewlyApp', () => {
  it('mounts in light DOM for development and replaces an earlier dev instance', () => {
    const options = {
      component: TestRoot,
      version: '1.0.0',
      setup: () => undefined,
      resetCss: 'p { color: red; }',
      isDev: true,
      useShadowDom: false,
      revealDelayMs: 0,
    }

    mountBewlyApp(options)
    mountBewlyApp(options)

    expect(document.querySelectorAll('#bewly')).toHaveLength(1)
    expect(document.querySelector('#bewly')?.getAttribute('data-dev')).toBe('true')
    expect(document.querySelector('[data-testid="mounted-root"]')?.textContent).toBe('mounted')
  })
})
