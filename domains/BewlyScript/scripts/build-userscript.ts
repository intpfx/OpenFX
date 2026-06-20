import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'

import { build } from 'vite'

import packageJson from '../package.json'
import { buildUserscriptMetadata } from '../src/userscript/metadata'
import { hasExternalExtensionUrl, sanitizeInlineSvg } from '../src/userscript/svg-sanitizer'
import { r } from './utils'

const buildDir = r('dist/.build/contentScripts')
const outputFile = r('dist/BewlyScript.user.js')
const publicOutputFile = r('public/bewlyscript/BewlyScript.user.js')
const webPublicOutputFile = r('../../entry/web/public/bewlyscript/BewlyScript.user.js')

async function readText(path: string): Promise<string> {
  return await readFile(path, 'utf8')
}

async function buildBundles(): Promise<void> {
  await rm(r('dist/.build'), { recursive: true, force: true })
  await mkdir(buildDir, { recursive: true })

  await build({
    configFile: r('vite.config.userscript.inject.ts'),
  })
  await build({
    configFile: r('vite.config.userscript.content.ts'),
  })
}

function assembleUserscript(options: {
  contentCode: string
  injectCode: string
  styleCss: string
}): string {
  const metadata = buildUserscriptMetadata(packageJson.version)
  const styleCss = JSON.stringify(options.styleCss)
  const injectCode = JSON.stringify(options.injectCode)

  return `${metadata}
;(function () {
  "use strict";

  var globalObject = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  var userscriptStyleCss = ${styleCss};
  globalObject.__BEWLYSCRIPT__ = true;
  globalObject.__BEWLYSCRIPT_STYLE_CSS__ = userscriptStyleCss;
  window.__BEWLYSCRIPT__ = true;
  window.__BEWLYSCRIPT_STYLE_CSS__ = userscriptStyleCss;

  function addGlobalStyle(css) {
    try {
      var style = document.createElement("style");
      style.id = "bewlyscript-global-style";
      style.textContent = css;
      (document.documentElement || document.head || document.body).appendChild(style);
    }
    catch (error) {
      console.warn("[BewlyScript] Failed to add global style", error);
    }
  }

  function injectMainWorld(code) {
    try {
      var script = document.createElement("script");
      script.textContent = code;
      (document.documentElement || document.head || document.body).appendChild(script);
      script.remove();
    }
    catch (error) {
      console.warn("[BewlyScript] Failed to inject page script", error);
    }
  }

  addGlobalStyle(userscriptStyleCss);
  injectMainWorld(${injectCode});
${options.contentCode}
})();`
}

function stripTrailingWhitespace(text: string): string {
  return text.replace(/[ \t]+$/gm, '')
}

async function main(): Promise<void> {
  await buildBundles()

  const contentCode = await readText(join(buildDir, 'content.global.js'))
  const injectCode = await readText(join(buildDir, 'inject.global.js'))
  const styleCss = await readText(join(buildDir, 'style.css'))
  const userscript = stripTrailingWhitespace(sanitizeInlineSvg(assembleUserscript({ contentCode, injectCode, styleCss })))
  if (hasExternalExtensionUrl(userscript))
    throw new Error('Refusing to write userscript with external extension URLs')

  for (const file of [outputFile, publicOutputFile, webPublicOutputFile]) {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, userscript)
    console.log(`Wrote ${file}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
