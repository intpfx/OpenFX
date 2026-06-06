import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  lint: {
    ignorePatterns: ["dist/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["dist/**"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:24531",
      "/auth": "http://127.0.0.1:24531",
      "/setup": "http://127.0.0.1:24531",
      "/system": "http://127.0.0.1:24531",
      "/agent": "http://127.0.0.1:24531",
      "/events": "http://127.0.0.1:24531",
      "/ws": {
        target: "http://127.0.0.1:24531",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
