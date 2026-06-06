import * as esbuild from "npm:esbuild";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader";
await esbuild.build({
  plugins: [...denoPlugins()],
  entryPoints: ['source/divertor.js'],
  outfile: './main.js',
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "esnext",
  minify: true,
  treeShaking: true,
  write: true,
});
await esbuild.stop();
console.log("Build completed");