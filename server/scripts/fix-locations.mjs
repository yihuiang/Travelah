/**
 * Re-derive Malaysian state labels for existing posts and places with the
 * improved inference (and, optionally, authoritative Google geocoding).
 *
 * Posts (merged-data.json)  → re-scored from sourceKeyword/location/title/desc.
 * Places (places.json)      → name-based inference + known overrides, and with
 *                             --google, the real state from Google's address.
 *
 * Usage:
 *   node scripts/fix-locations.mjs                 # posts + places, keyword only
 *   node scripts/fix-locations.mjs --dry-run       # report, write nothing
 *   node scripts/fix-locations.mjs --places --google --limit=5   # test Google on 5
 *   node scripts/fix-locations.mjs --google        # full Google ground-truth
 *
 * After writing, re-seed MongoDB:  npm run seed:mongodb && npm run seed:places
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import {
  inferStateScored,
  stateFromGoogleAddress,
  normalizeStateName,
  KNOWN_PLACE_STATES,
} from './lib/infer-state.mjs'
import { searchPlace } from './lib/google-places.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const mergedPath = path.resolve(__dirname, '../data/merged-data.json')
const placesPath = path.resolve(__dirname, '../data/places.json')
const apiKey = process.env.GOOGLE_PLACES_API_KEY
const delayMs = Number(process.env.GOOGLE_PLACES_DELAY_MS || 250)

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const useGoogle = args.includes('--google')
const onlyPosts = args.includes('--posts')
const onlyPlaces = args.includes('--places')
const doPosts = !onlyPlaces
const doPlaces = !onlyPosts
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function distribution(items) {
  const dist = {}
  for (const it of items) dist[it.state || 'Malaysia'] = (dist[it.state || 'Malaysia'] || 0) + 1
  return Object.fromEntries(Object.entries(dist).sort((a, b) => b[1] - a[1]))
}

function normKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function fixPosts() {
  const posts = readJson(mergedPath)
  const before = distribution(posts)
  let changed = 0
  for (const post of posts) {
    const next = inferStateScored({
      sourceKeyword: post.sourceKeyword,
      location: post.location,
      title: post.title,
      description: post.description,
      batchLabel: post.batch,
    })
    if (next !== post.state) {
      changed += 1
      post.state = next
    }
  }
  console.log(`\n=== POSTS (${posts.length}) — ${changed} re-tagged ===`)
  console.log('before:', JSON.stringify(before))
  console.log('after :', JSON.stringify(distribution(posts)))
  if (!dryRun) {
    fs.writeFileSync(mergedPath, JSON.stringify(posts, null, 2), 'utf8')
    console.log(`written → ${mergedPath}`)
  }
}

// Keyword/override-only state for a place (no network).
function placeStateFromText(place) {
  const known = KNOWN_PLACE_STATES[normKey(place.name)]
  if (known) return known
  const fromName = inferStateScored({ sourceKeyword: place.name, description: place.description })
  return fromName !== 'Malaysia' ? fromName : place.state || 'Malaysia'
}

async function fixPlaces() {
  let places = readJson(placesPath)
  const before = distribution(places)
  let changed = 0
  let googleResolved = 0
  let googleMissed = 0
  let googleSkipped = 0

  let targets = places
  if (limit > 0) targets = places.slice(0, limit)

  for (let i = 0; i < targets.length; i++) {
    const place = targets[i]
    let next = placeStateFromText(place)

    if (useGoogle && apiKey) {
      if (place.googleState) {
        // Already verified in a previous run — reuse it, no API call (saves cost).
        next = place.googleState
        googleSkipped += 1
      } else {
        try {
          const match = await searchPlace(apiKey, `${place.name}, Malaysia`)
          const gState = match?.formattedAddress
            ? stateFromGoogleAddress(match.formattedAddress)
            : null
          if (gState) {
            next = gState
            place.googleState = gState
            place.googleFormattedAddress = match.formattedAddress
            googleResolved += 1
          } else {
            googleMissed += 1
          }
        } catch (err) {
          googleMissed += 1
          if (googleResolved + googleMissed < 3) {
            console.log(`  google error (${place.name}): ${err.message.slice(0, 80)}`)
          }
        }
        await sleep(delayMs) // only delay after a real API call
      }
    }

    if (next && next !== place.state) {
      changed += 1
      place.state = next
    }
  }

  console.log(`\n=== PLACES (${places.length}${limit ? `, first ${limit}` : ''}) — ${changed} re-tagged ===`)
  if (useGoogle) {
    console.log(`google: ${googleResolved} resolved, ${googleMissed} missed, ${googleSkipped} skipped (already verified)`)
  }
  console.log('before:', JSON.stringify(before))
  console.log('after :', JSON.stringify(distribution(places)))
  if (!dryRun) {
    fs.writeFileSync(placesPath, JSON.stringify(places, null, 2), 'utf8')
    console.log(`written → ${placesPath}`)
  }
}

async function main() {
  console.log(`fix-locations — dryRun=${dryRun} google=${useGoogle}${limit ? ` limit=${limit}` : ''}`)
  if (useGoogle && !apiKey) {
    console.log('⚠️  --google requested but no GOOGLE_PLACES_API_KEY in server/.env — skipping Google.')
  }
  if (doPosts) fixPosts()
  if (doPlaces) await fixPlaces()
  if (!dryRun) console.log('\nNext: npm run seed:mongodb && npm run seed:places')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
