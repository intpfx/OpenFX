import { defineConfig, mergeConfig } from 'vite'

import { r } from './scripts/utils'
import { sharedConfig } from './vite.config'

export default defineConfig(mergeConfig(sharedConfig, {
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
      entry: r('src/inject/index.ts'),
      name: 'BewlyScript',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        entryFileNames: 'inject.global.js',
      },
    },
  },
}))
