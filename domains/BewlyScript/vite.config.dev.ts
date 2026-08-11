import UnoCSS from 'unocss/vite'
import { defineConfig, mergeConfig } from 'vite'

import { sharedConfig } from './vite.config'

export default defineConfig(mergeConfig(sharedConfig, {
  plugins: [UnoCSS()],
  optimizeDeps: {
    exclude: ['webextension-polyfill'],
  },
}))
