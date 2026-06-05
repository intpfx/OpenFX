import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import { defineNitroConfig } from "nitropack/config";

const rootDir = fileURLToPath(new URL("./", import.meta.url));
const clientDistDir = fileURLToPath(new URL("./.client-dist", import.meta.url));
const howMuchPublicDir = fileURLToPath(
  new URL("../../domains/how-much/public", import.meta.url),
);
const wanonePublicDir = fileURLToPath(
  new URL("../../domains/wanone/public", import.meta.url),
);
const nitroDevPort = Number(process.env.OPENFX_NITRO_DEV_PORT ?? "3000");

export default defineNitroConfig({
  srcDir: fileURLToPath(new URL("./server", import.meta.url)),
  serveStatic: "inline",
  devServer: {
    port: nitroDevPort,
  },
  output: {
    dir: fileURLToPath(new URL("./.output", import.meta.url)),
  },
  publicAssets: [
    {
      dir: clientDistDir,
      maxAge: 60 * 60 * 24 * 30,
    },
    {
      dir: howMuchPublicDir,
      maxAge: 0,
    },
    {
      dir: wanonePublicDir,
      maxAge: 60 * 60 * 24 * 30,
    },
  ],
  alias: {
    "@": rootDir,
  },
  compatibilityDate: "2026-05-18",
});
