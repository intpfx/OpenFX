/// <reference types="vitest" />

import process from 'node:process'

import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import replace from '@rollup/plugin-replace'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import type { UserConfig } from 'vite'

import { r } from './scripts/utils'

const isDev = process.env.NODE_ENV !== 'production'

export const sharedConfig: UserConfig = {
  root: r('src'),
  resolve: {
    alias: {
      '~/': `${r('src')}/`,
      '~': r('src'),
    },
  },
  plugins: [
    Vue(),

    AutoImport({
      imports: [
        'vue',
        {
          'webextension-polyfill': [
            ['*', 'browser'],
          ],
        },
      ],
    }),

    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18nPlugin({
      runtimeOnly: true,
      compositionOnly: true,
      strictMessage: false,
      include: [r('./src/_locales/**')],
    }),

    // https://github.com/unocss/unocss
    // UnoCSS(),

    replace({
      '__DEV__': JSON.stringify(isDev),
      'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
      '__VUE_OPTIONS_API__': JSON.stringify(true),
      '__VUE_PROD_DEVTOOLS__': JSON.stringify(false),
      'preventAssignment': true,
    }),

  ],
  optimizeDeps: {
    include: [
      'vue',
      '@vueuse/core',
    ],
    exclude: [
      'vue-demi',
    ],
  },

}

export default {
  ...sharedConfig,
  test: {
    globals: true,
    environment: 'jsdom',
  },
}
