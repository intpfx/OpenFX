import { page } from 'vite-plus/test/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { mountBewlyApp } from '~/contentScripts/mount-app'

const InteractiveRoot = defineComponent({
  name: 'InteractiveRoot',
  setup() {
    const count = ref(0)
    return () => h('button', {
      type: 'button',
      onClick: () => count.value += 1,
    }, `已点击 ${count.value} 次`)
  },
})

describe('bewlyScript browser mount', () => {
  afterEach(() => {
    document.querySelectorAll('#bewly').forEach(element => element.remove())
  })

  it('mounts the shared app shell and responds to a real browser click', async () => {
    mountBewlyApp({
      component: InteractiveRoot,
      version: '1.0.0-browser-test',
      setup: () => undefined,
      resetCss: 'button { font: inherit; }',
      isDev: true,
      useShadowDom: false,
      revealDelayMs: 0,
    })

    const button = page.getByRole('button', { name: '已点击 0 次' })
    await expect.element(button).toBeVisible()
    await button.click()
    await expect.element(page.getByRole('button', { name: '已点击 1 次' })).toBeVisible()
  })
})
