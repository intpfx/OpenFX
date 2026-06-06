import path from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) {
    return undefined
  }

  if (id.includes('echarts-for-react')) {
    return 'vendor-charts-react'
  }

  if (id.includes('echarts/renderers')) {
    return 'vendor-charts-renderers'
  }

  if (id.includes('echarts/charts')) {
    return 'vendor-charts-series'
  }

  if (id.includes('echarts/components')) {
    return 'vendor-charts-components'
  }

  if (id.includes('echarts/core')) {
    return 'vendor-charts-runtime'
  }

  if (id.includes('zrender')) {
    return 'vendor-charts-renderer'
  }

  if (id.includes('echarts')) {
    return 'vendor-charts-core'
  }

  if (id.includes('xlsx')) {
    return 'vendor-xlsx'
  }

  if (
    id.includes('@radix-ui')
    || id.includes('cmdk')
    || id.includes('react-day-picker')
    || id.includes('framer-motion')
    || id.includes('lucide-react')
  ) {
    return 'vendor-ui'
  }

  if (
    id.includes('/react/')
    || id.includes('/react-dom/')
    || id.includes('scheduler')
  ) {
    return 'vendor-react'
  }

  return 'vendor-misc'
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 700,
    outDir: 'public/finlyzer',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
