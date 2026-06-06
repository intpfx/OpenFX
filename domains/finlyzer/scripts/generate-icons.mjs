import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(currentDir, '..')
const sourcePngPath = path.join(rootDir, 'public', 'finlyzer.png')
const outputDir = path.join(rootDir, 'build')
const iconPngPath = path.join(outputDir, 'icon.png')
const iconIcoPath = path.join(outputDir, 'icon.ico')

await mkdir(outputDir, { recursive: true })

await sharp(sourcePngPath)
  .resize(512, 512)
  .png()
  .toFile(iconPngPath)

const iconBuffer = await pngToIco(iconPngPath)
await writeFile(iconIcoPath, iconBuffer)