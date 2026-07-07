/**
 * Audit Kuala Lumpur places curation status.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const places = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/places.json'), 'utf8'))
const kl = places.filter((p) => p.state === 'Kuala Lumpur')

const badCoverRe = /douyinpic|rednotecdn|xhscdn|tiktok|fbcdn|instagram/i
const hasHours = (p) =>
  (p.openingHours?.length || p.googleOpeningHours?.length || p.openingHoursSource) > 0 ||
  Boolean(p.openingHoursSource)
const isDone = (p) =>
  p.googlePlaceId &&
  p.coverImage?.startsWith('/places/') &&
  !badCoverRe.test(p.coverImage || '') &&
  p.googleRating != null &&
  hasHours(p)

const done = kl.filter(isDone)
const partial = kl.filter((p) => !isDone(p))
const badCovers = kl.filter((p) => badCoverRe.test(p.coverImage || '') || !p.coverImage?.startsWith('/places/'))
const noRating = kl.filter((p) => p.googleRating == null)
const noGoogle = kl.filter((p) => !p.googlePlaceId)
const noHours = kl.filter((p) => p.googlePlaceId && !hasHours(p))

console.log('=== KL audit ===')
console.log('Total:', kl.length)
console.log('Fully done:', done.length)
console.log('Partial:', partial.length)
console.log('Bad/social covers:', badCovers.length)
console.log('Missing googlePlaceId:', noGoogle.length)
console.log('Missing rating:', noRating.length)
console.log('Missing hours (has Google):', noHours.length)

if (badCovers.length) {
  console.log('\n--- Bad covers ---')
  for (const p of badCovers.sort((a, b) => (b.totalLikes || 0) - (a.totalLikes || 0))) {
    console.log(`  ${p._id} | ${p.name} | ${(p.coverImage || '').slice(0, 60)}`)
  }
}

if (noGoogle.length) {
  console.log('\n--- No Google ID ---')
  for (const p of noGoogle) console.log(`  ${p._id} | ${p.name}`)
}

if (noRating.length) {
  console.log('\n--- No rating ---')
  for (const p of noRating.slice(0, 20)) console.log(`  ${p._id} | ${p.name}`)
  if (noRating.length > 20) console.log(`  ... +${noRating.length - 20} more`)
}

if (noHours.length) {
  console.log('\n--- Missing hours (sample) ---')
  for (const p of noHours.slice(0, 15)) console.log(`  ${p._id} | ${p.name}`)
  if (noHours.length > 15) console.log(`  ... +${noHours.length - 15} more`)
}
