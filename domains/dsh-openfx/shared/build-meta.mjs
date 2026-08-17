/** Build the no-op host entry for a configuration-only bundle package. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

mkdirSync(resolve('lib'), { recursive: true })
writeFileSync(
  resolve('lib/index.js'),
  "/** Configuration-only OpenFX bundle. */\nexport const name = 'openfx-web'\n/** Mount no direct behavior; the bundle patch composes feature packages. */\nexport function apply() {}\n",
)
