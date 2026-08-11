import UnoCSS from 'unocss/vite'
import { defineConfig, mergeConfig } from 'vite'
import monkey from 'vite-plugin-monkey'

import {
  getUserscriptVersion,
  USERSCRIPT_CONNECTS,
  USERSCRIPT_MATCHES,
  USERSCRIPT_NAME,
  USERSCRIPT_NAMESPACE,
} from './src/userscript/metadata'
import { sharedConfig } from './vite.config'

export default defineConfig(mergeConfig(sharedConfig, {
  plugins: [
    UnoCSS(),
    monkey({
      entry: 'src/dev/site.ts',
      userscript: {
        name: `${USERSCRIPT_NAME} Dev`,
        namespace: `${USERSCRIPT_NAMESPACE}/dev`,
        version: `${getUserscriptVersion()}-dev`,
        description: 'BewlyScript live-site development loader. Do not publish.',
        match: [...USERSCRIPT_MATCHES],
        grant: 'none',
        connect: [...USERSCRIPT_CONNECTS, '127.0.0.1', 'localhost'],
        'run-at': 'document-start',
        'inject-into': 'content',
      },
      server: {
        open: false,
        prefix: false,
      },
      build: {
        autoGrant: false,
      },
    }),
  ],
  optimizeDeps: {
    exclude: [
      'vue-demi',
      'webextension-polyfill',
    ],
  },
}))
