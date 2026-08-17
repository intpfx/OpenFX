import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const stub = (name: string): string => fileURLToPath(new URL(`./tests/stubs/${name}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@deepseek-ai/dsh-client-runtime/client": stub("runtime.ts"),
      "@deepseek-ai/dsh-client-ui-primitives": stub("primitives.tsx"),
    },
  },
  test: {
    include: ["tests/**/*.spec.ts", "tests/**/*.spec.tsx"],
    pool: "forks",
    environmentOptions: { jsdom: { url: "http://localhost/" } },
  },
});
