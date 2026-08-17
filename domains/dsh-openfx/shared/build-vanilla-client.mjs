/** Build a dependency-free DSH client package and its no-op host entry. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const sourcePath = resolve(root, 'src/client.js')
let source = readFileSync(sourcePath, 'utf8')
const svgPath = resolve(root, 'src/hero-whale.svg')
if (source.includes('__HERO_WHALE_SVG__')) {
  if (!existsSync(svgPath)) throw new Error(`${manifest.name}: missing src/hero-whale.svg`)
  source = source.replace('__HERO_WHALE_SVG__', JSON.stringify(readFileSync(svgPath, 'utf8')))
}

const bundle = [
  `/* Built from src/client.js for ${manifest.name}. */`,
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: () => {`,
  '  "use strict";',
  '  const module = { exports: {} };',
  '  const exports = module.exports;',
  '',
  source.trim(),
  '',
  '  return module.exports;',
  '} });',
  '',
].join('\n')

const hostName = manifest.name.replace(/^dsh-/, '')
const host = [
  `/** No-op host half for ${manifest.name}; behavior lives in ./client. */`,
  `export const name = ${JSON.stringify(hostName)}`,
  '/** Mount no host-side behavior. */',
  'export function apply() {}',
  '',
].join('\n')

mkdirSync(resolve(root, 'lib'), { recursive: true })
writeFileSync(resolve(root, 'lib/client.js'), bundle)
writeFileSync(resolve(root, 'lib/index.js'), host)
