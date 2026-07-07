/**
 * Batch enrich + Google covers for Putrajaya places needing work.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const BATCH = 25
const STATE = 'Putrajaya'
const placesJsonPath = path.resolve(__dirname, '../data/places.json')

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit', shell: true })
  if (r.status !== 0) throw new Error(`${cmd} failed`)
}

const badCoverRe = /douyinpic|rednotecdn|xhscdn|tiktok|fbcdn|instagram|http/i
const hasHours = (p) =>
  Boolean(p.openingHours?.length || p.googleOpeningHours?.length || p.openingHoursSource)

const places = JSON.parse(fs.readFileSync(placesJsonPath, 'utf8'))
const skip = places.filter(
  (p) =>
    p.state === STATE &&
    p.googlePlaceId &&
    p.coverImage?.startsWith('/places/') &&
    !badCoverRe.test(p.coverImage || '') &&
    p.googleRating != null &&
    hasHours(p),
)

const skipIds = new Set(skip.map((p) => p._id))
const todo = places
  .filter((p) => p.state === STATE && !skipIds.has(p._id))
  .sort((a, b) => (b.totalLikes || 0) - (a.totalLikes || 0))

console.log(`${STATE} skip (done): ${skipIds.size}`)
console.log(`${STATE} todo: ${todo.length}`)

for (let i = 0; i < todo.length; i += BATCH) {
  const chunk = todo.slice(i, i + BATCH)
  const ids = chunk.map((p) => p._id).join(',')
  console.log(`\n=== Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(todo.length / BATCH)} (${chunk.length} places) ===`)
  run('npm', ['run', 'enrich:places-google', '--', `--ids=${ids}`, '--force'])
  run('npm', ['run', 'patch:covers', '--', '--google', `--ids=${ids}`, '--force'])
  run('npm', ['run', 'enrich:places-google', '--', `--ids=${ids}`, '--force'])
}

const after = JSON.parse(fs.readFileSync(placesJsonPath, 'utf8'))
const needHoursIds = after
  .filter((p) => p.state === STATE && p.googlePlaceId && !hasHours(p))
  .map((p) => p._id)
  .join(',')
if (needHoursIds) {
  console.log(`\n=== Opening hours pass (${needHoursIds.split(',').length} places) ===`)
  run('npm', ['run', 'enrich:opening-hours', '--', `--ids=${needHoursIds}`, '--force'])
}

run('npm', ['run', 'upload:r2:places'])
run('npm', ['run', 'sync:google-enrichment'])
console.log('\nDone.')
