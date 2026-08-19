import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "@voidzero-dev/vite-plus-core";

const rootDir = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  root: rootDir,
  base: "./",
  publicDir: false,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5504,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL("./public/openink", import.meta.url)),
    emptyOutDir: true,
  },
});
