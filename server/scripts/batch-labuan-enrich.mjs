/**
 * Batch enrich + Google covers for Labuan places.
 */
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit', shell: true })
  if (r.status !== 0) throw new Error(`${cmd} failed`)
}

const IDS = 'p_76a4167f189d,p_8c86498769e5,p_dfc427203262'

console.log('Labuan — curated Google covers + enrichment\n')
run('node', ['scripts/patch-labuan-covers.mjs'])
run('npm', ['run', 'seed:places'])
