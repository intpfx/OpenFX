import UnoCSS from 'unocss/vite'
import { defineConfig, mergeConfig } from 'vite'
import { playwright } from 'vite-plus/test/browser/providers/playwright'

import { sharedConfig } from './vite.config'

export default defineConfig(mergeConfig(sharedConfig, {
  plugins: [UnoCSS()],
  optimizeDeps: {
    exclude: [
      'vue-demi',
      'webextension-polyfill',
    ],
  },
  test: {
    globals: true,
    include: ['tests/browser/**/*.browser.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
}))
