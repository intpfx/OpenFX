import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import { defineNitroConfig } from "nitropack/config";
import {
  createNitroPublicAssets,
  createNitroServerAssets,
} from "./publication-targets.ts";

const rootDir = fileURLToPath(new URL("./", import.meta.url));
const denoDeployEntry = process.env.NITRO_PRESET === "deno_deploy" ||
    process.env.NITRO_PRESET === "deno-deploy"
  ? "./runtime/deno-deploy.ts"
  : undefined;

export default defineNitroConfig({
  srcDir: fileURLToPath(new URL("./server", import.meta.url)),
  entry: denoDeployEntry,
  serveStatic: "inline",
  output: {
    dir: fileURLToPath(new URL("./.output", import.meta.url)),
  },
  publicAssets: createNitroPublicAssets(fileURLToPath),
  serverAssets: createNitroServerAssets(fileURLToPath),
  alias: {
    "@": rootDir,
  },
  compatibilityDate: "2026-05-18",
});
