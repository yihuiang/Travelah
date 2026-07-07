/**
 * Enrich MongoDB places with Google rating + opening hours (Places API New).
 * Opening hours: only used when OSM did not provide hours (see opening-hours.mjs).
 *
 * Prerequisites:
 *   1. Enable "Places API (New)" in Google Cloud Console
 *   2. Add GOOGLE_PLACES_API_KEY to server/.env
 *
 * Usage:
 *   npm run enrich:places-google -- --limit=5
 *   npm run enrich:places-google
 *   npm run enrich:places-google -- --force
 *   npm run enrich:places-google -- --page=2 --missing
 *   npm run enrich:places-google -- --ids=p_abc,p_def
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import { enrichPlaceFromGoogle, getPlaceDetails, normalizeGoogleDetails } from './lib/google-places.mjs'
import {
  loadEnrichmentStore,
  mergePlaceIntoStore,
  placeNeedsGoogleEnrichment,
  saveEnrichmentStore,
} from './lib/google-enrichment-store.mjs'
import {
  hasOsmDisplayHours,
  hasOpeningHoursList,
  resolveDisplayOpeningHours,
} from './lib/opening-hours.mjs'
import { filterByIds, parseExploreArgs, sliceExplorePage } from './lib/explore-page.mjs'

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
  const missingOnly = process.argv.includes('--missing')
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0
  return { force, missingOnly, limit, ...parseExploreArgs() }
}

async function fetchGooglePatch(place) {
  if (place.googlePlaceId) {
    const details = await getPlaceDetails(apiKey, place.googlePlaceId)
    return { ok: true, ...normalizeGoogleDetails(details) }
  }
  return enrichPlaceFromGoogle(apiKey, place)
}

function needsPartialEnrichment(place) {
  return place.googleRating == null || !hasOpeningHoursList(place.openingHours)
}

async function main() {
  if (!apiKey) {
    throw new Error(
      'Missing GOOGLE_PLACES_API_KEY in server/.env — create an API key in Google Cloud Console.',
    )
  }

  const { force, missingOnly, limit, page, pageSize, ids } = parseArgs()
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const collection = client.db(dbName).collection('places')
    let places = await collection.find({}).sort({ totalLikes: -1 }).toArray()

    const enrichmentStore = loadEnrichmentStore()
    const scoped = page > 0 || ids.length > 0

    places = filterByIds(places, ids)
    places = sliceExplorePage(places, { page, pageSize })

    if (!force && !scoped) {
      places = places.filter((p) => placeNeedsGoogleEnrichment(p, enrichmentStore))
    }
    if (missingOnly) {
      places = places.filter(needsPartialEnrichment)
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
        const result = await fetchGooglePatch(place)
        if (!result.ok) {
          failed += 1
          console.log(`  [${i + 1}/${places.length}] skip — no match: ${label}`)
          continue
        }

        const patch = {
          googlePlaceId: result.googlePlaceId,
          googleRating: result.googleRating,
          googleReviewCount: result.googleReviewCount,
          googleMapsUri: result.googleMapsUri,
          googleDescription: result.googleDescription,
          googleEnrichedAt: result.googleEnrichedAt,
        }
        if (result.openingHours?.length) {
          patch.googleOpeningHours = result.openingHours
        }
        if (!hasOsmDisplayHours(place) && result.openingHours?.length) {
          patch.openingHours = result.openingHours
          patch.openingHoursSource = 'google'
        }

        const merged = resolveDisplayOpeningHours({ ...place, ...patch })

        await collection.updateOne({ _id: place._id }, { $set: merged })
        mergePlaceIntoStore(enrichmentStore, merged)
        saved += 1
        const rating = result.googleRating != null ? `${result.googleRating}★` : 'no rating'
        const hoursNote =
          merged.openingHoursSource === 'google'
            ? ', Google hours'
            : merged.openingHoursSource === 'osm'
              ? ', kept OSM hours'
              : ''
        const descNote = result.googleDescription ? ', has description' : ''
        console.log(
          `  [${i + 1}/${places.length}] ok — ${label} → ${rating} (${result.googleReviewCount ?? 0} reviews${descNote}${hoursNote})`,
        )
      } catch (err) {
        failed += 1
        console.log(`  [${i + 1}/${places.length}] error — ${label}: ${err.message}`)
      }

      if (i < places.length - 1) await sleep(delayMs)
    }

    saveEnrichmentStore(enrichmentStore)

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
