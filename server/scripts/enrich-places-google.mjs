/**
 * Enrich MongoDB places with Google rating + opening hours (Places API New).
 *
 * Prerequisites:
 *   1. Enable "Places API (New)" in Google Cloud Console
 *   2. Add GOOGLE_PLACES_API_KEY to server/.env
 *
 * Usage:
 *   npm run enrich:places-google -- --limit 5     # test first
 *   npm run enrich:places-google                  # all un-enriched places
 *   npm run enrich:places-google -- --force       # re-fetch all
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import { enrichPlaceFromGoogle } from './lib/google-places.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const placesJsonPath = path.resolve(__dirname, '../data/places.json')
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'
const apiKey = process.env.GOOGLE_PLACES_API_KEY
const delayMs = Number(process.env.GOOGLE_PLACES_DELAY_MS || 250)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseArgs() {
  const force = process.argv.includes('--force')
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0
  return { force, limit }
}

async function main() {
  if (!apiKey) {
    throw new Error(
      'Missing GOOGLE_PLACES_API_KEY in server/.env — create an API key in Google Cloud Console.',
    )
  }

  const { force, limit } = parseArgs()
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const collection = client.db(dbName).collection('places')
    let places = await collection.find({}).sort({ totalLikes: -1 }).toArray()

    if (!force) {
      places = places.filter((p) => !p.googleEnrichedAt)
    }
    if (limit > 0) {
      places = places.slice(0, limit)
    }

    if (places.length === 0) {
      console.log('No places to enrich. Use --force to re-fetch or check MongoDB.')
      return
    }

    console.log(`Enriching ${places.length} places via Google Places API…`)
    let saved = 0
    let failed = 0

    for (let i = 0; i < places.length; i++) {
      const place = places[i]
      const label = `${place._id} ${place.name}`
      try {
        const result = await enrichPlaceFromGoogle(apiKey, place)
        if (!result.ok) {
          failed += 1
          console.log(`  [${i + 1}/${places.length}] skip — no match: ${label}`)
          continue
        }

        const patch = {
          googlePlaceId: result.googlePlaceId,
          googleRating: result.googleRating,
          googleReviewCount: result.googleReviewCount,
          openingHours: result.openingHours,
          googleMapsUri: result.googleMapsUri,
          googleDescription: result.googleDescription,
          googleEnrichedAt: result.googleEnrichedAt,
        }

        await collection.updateOne({ _id: place._id }, { $set: patch })
        saved += 1
        const rating = result.googleRating != null ? `${result.googleRating}★` : 'no rating'
        const descNote = result.googleDescription ? ', has description' : ''
        console.log(
          `  [${i + 1}/${places.length}] ok — ${label} → ${rating} (${result.googleReviewCount ?? 0} reviews${descNote})`,
        )
      } catch (err) {
        failed += 1
        console.log(`  [${i + 1}/${places.length}] error — ${label}: ${err.message}`)
      }

      if (i < places.length - 1) await sleep(delayMs)
    }

    if (fs.existsSync(placesJsonPath)) {
      const all = await collection.find({}).toArray()
      const jsonPlaces = all.map(({ _id, ...rest }) => ({ _id, ...rest }))
      fs.writeFileSync(placesJsonPath, JSON.stringify(jsonPlaces, null, 2), 'utf8')
      console.log(`Synced ${jsonPlaces.length} places → ${placesJsonPath}`)
    }

    console.log(`Done — enriched ${saved}, failed/skipped ${failed}`)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
