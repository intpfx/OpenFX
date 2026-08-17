/** Remove only the current package's generated lib directory before rebuilding. */
import { readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
if (typeof manifest.name !== 'string' || !manifest.name.startsWith('dsh-')) {
  throw new Error('clean-lib must run from a dsh-* package directory')
}
await rm(resolve(root, 'lib'), { recursive: true, force: true })
