/**
 * Audit Putrajaya places curation status.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const places = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/places.json'), 'utf8'))
const pj = places.filter((p) => p.state === 'Putrajaya')

const badCoverRe = /douyinpic|rednotecdn|xhscdn|tiktok|fbcdn|instagram|http/i
const hasHours = (p) =>
  Boolean(p.openingHours?.length || p.googleOpeningHours?.length || p.openingHoursSource)
const isDone = (p) =>
  p.googlePlaceId &&
  p.coverImage?.startsWith('/places/') &&
  !badCoverRe.test(p.coverImage || '') &&
  p.googleRating != null &&
  hasHours(p)

const done = pj.filter(isDone)
const partial = pj.filter((p) => !isDone(p))
const badCovers = pj.filter((p) => badCoverRe.test(p.coverImage || '') || !p.coverImage?.startsWith('/places/'))
const noGoogle = pj.filter((p) => !p.googlePlaceId)
const noRating = pj.filter((p) => p.googleRating == null)
const noHours = pj.filter((p) => p.googlePlaceId && !hasHours(p))

console.log('=== Putrajaya audit ===')
console.log('Total:', pj.length)
console.log('Fully done:', done.length)
console.log('Partial:', partial.length)
console.log('Bad/social covers:', badCovers.length)
console.log('Missing googlePlaceId:', noGoogle.length)
console.log('Missing rating:', noRating.length)
console.log('Missing hours (has Google):', noHours.length)

if (badCovers.length) {
  console.log('\n--- Bad covers ---')
  for (const p of badCovers.sort((a, b) => (b.totalLikes || 0) - (a.totalLikes || 0)))
    console.log(`  ${p._id} | ${p.name} | ${(p.coverImage || '').slice(0, 70)}`)
}

if (partial.length) {
  console.log('\n--- All partial ---')
  for (const p of partial.sort((a, b) => (b.totalLikes || 0) - (a.totalLikes || 0)))
    console.log(`  ${p._id} | ${p.name} | rating:${p.googleRating ?? '-'} | cover:${p.coverImage?.startsWith('/places/') ? 'local' : 'bad'} | hours:${hasHours(p)}`)
}
