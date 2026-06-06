import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const releaseDir = path.resolve(currentDir, '..', 'release')

await rm(releaseDir, { recursive: true, force: true })