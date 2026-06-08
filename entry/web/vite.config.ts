import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const rootDir = fileURLToPath(new URL("./", import.meta.url));
const clientDistDir = fileURLToPath(new URL("./.client-dist", import.meta.url));
const nitroDevPort = Number(process.env.OPENFX_NITRO_DEV_PORT ?? "3000");

export default defineConfig({
  root: rootDir,
  plugins: [react()],
  resolve: {
    alias: {
      "@": rootDir,
      "@web": fileURLToPath(new URL("./src", import.meta.url)),
      "@domains": fileURLToPath(new URL("../../domains", import.meta.url)),
    },
  },
  server: {
    port: 5501,
    strictPort: true,
    proxy: {
      "/api": `http://localhost:${nitroDevPort}`,
      "/gas-cad-stats": `http://localhost:${nitroDevPort}`,
      "/update": `http://localhost:${nitroDevPort}`,
    },
  },
  build: {
    outDir: clientDistDir,
    emptyOutDir: true,
  },
  test: {},
  lint: {},
  fmt: {},
});
