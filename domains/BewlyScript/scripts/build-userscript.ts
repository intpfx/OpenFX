import { rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

import { build } from 'vite'

import packageJson from '../package.json'
import { buildUserscriptMetadata } from '../src/userscript/metadata'
import { hasExternalExtensionUrl, sanitizeInlineSvg } from '../src/userscript/svg-sanitizer'
import { r } from './utils'

const buildDir = r('dist/.build/contentScripts')
const outputFile = r('dist/BewlyScript.user.js')

const resourceFiles = [
  ['assets/anime-timetable-icons.png', r('assets/anime-timetable-icons.png')],
  ['assets/empty.png', r('assets/empty.png')],
  ['assets/icon-512.png', r('assets/icon-512.png')],
  ['assets/loading.gif', r('assets/loading.gif')],
] as const

function mimeType(path: string): string {
  switch (extname(path)) {
    case '.gif':
      return 'image/gif'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.css':
      return 'text/css;charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

function toDataUrl(path: string, content: Buffer | string): string {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content)
  return `data:${mimeType(path)};base64,${body.toString('base64')}`
}

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

async function buildResourceMap(): Promise<Record<string, string>> {
  const resources: Record<string, string> = {}

  for (const [resourcePath, filePath] of resourceFiles) {
    resources[resourcePath] = toDataUrl(resourcePath, await readFile(filePath))
  }

  return resources
}

function assembleUserscript(options: {
  contentCode: string
  injectCode: string
  resources: Record<string, string>
  styleCss: string
}): string {
  const metadata = buildUserscriptMetadata(packageJson.version)
  const resourceJson = JSON.stringify(options.resources)
  const styleCss = JSON.stringify(options.styleCss)
  const injectCode = JSON.stringify(options.injectCode)

  return `${metadata}
;(function () {
  "use strict";

  var globalObject = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  var userscriptStyleCss = ${styleCss};
  globalObject.__BEWLYSCRIPT__ = true;
  globalObject.__BEWLYSCRIPT_STYLE_CSS__ = userscriptStyleCss;
  globalObject.__BEWLYSCRIPT_RESOURCES__ = ${resourceJson};
  window.__BEWLYSCRIPT__ = true;
  window.__BEWLYSCRIPT_STYLE_CSS__ = userscriptStyleCss;
  window.__BEWLYSCRIPT_RESOURCES__ = globalObject.__BEWLYSCRIPT_RESOURCES__;

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

async function main(): Promise<void> {
  await buildBundles()

  const contentCode = await readText(join(buildDir, 'content.global.js'))
  const injectCode = await readText(join(buildDir, 'inject.global.js'))
  const styleCss = await readText(join(buildDir, 'style.css'))
  const resources = await buildResourceMap()
  const userscript = sanitizeInlineSvg(assembleUserscript({ contentCode, injectCode, resources, styleCss }))
  if (hasExternalExtensionUrl(userscript))
    throw new Error('Refusing to write userscript with external extension URLs')

  await mkdir(r('dist'), { recursive: true })
  await writeFile(outputFile, userscript)
  console.log(`Wrote ${outputFile}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
