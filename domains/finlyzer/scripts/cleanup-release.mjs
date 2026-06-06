import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const releaseDir = path.resolve(currentDir, '..', 'release')

const entries = await readdir(releaseDir, { withFileTypes: true }).catch(() => [])

await Promise.all(
  entries
    .filter((entry) => !(entry.isFile() && entry.name.toLowerCase().endsWith('.exe')))
    .map((entry) => rm(path.join(releaseDir, entry.name), { recursive: true, force: true })),
)