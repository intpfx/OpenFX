import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.OPENFX_MEDIA_PLAYER_BASE ?? '/media-player/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    host: '127.0.0.1',
    port: 9300,
  },
});
