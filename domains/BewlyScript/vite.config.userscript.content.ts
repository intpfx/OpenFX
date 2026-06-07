import UnoCSS from 'unocss/vite'
import { defineConfig, mergeConfig } from 'vite'

import { r } from './scripts/utils'
import { sharedConfig } from './vite.config'

export default defineConfig(mergeConfig(sharedConfig, {
  resolve: {
    alias: {
      'webextension-polyfill': r('src/userscript/browser-shim.ts'),
    },
  },
  plugins: [
    UnoCSS(),
  ],
  define: {
    __BEWLYSCRIPT__: 'true',
    'process.env.FIREFOX': 'false',
  },
  build: {
    outDir: r('dist/.build/contentScripts'),
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: r('src/contentScripts/index.ts'),
      name: 'BewlyScript',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        entryFileNames: 'content.global.js',
        assetFileNames: 'style.css',
      },
    },
  },
}))
