/**
 * Opening hours: OSM (free) first, then Google API fallback.
 * Skips places that already have `openingHours` unless --force.
 *
 * Usage:
 *   npm run enrich:opening-hours -- --limit=10
 *   npm run enrich:opening-hours -- --limit=10 --category=FOOD
 *   npm run enrich:opening-hours -- --force
 *   npm run enrich:opening-hours -- --page=2
 *   npm run enrich:opening-hours -- --ids=p_abc,p_def
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import { enrichPlaceFromGoogle } from './lib/google-places.mjs'
import { enrichPlaceFromOsm } from './lib/osm-overpass.mjs'
import {
  loadEnrichmentStore as loadGoogleStore,
  mergePlaceIntoStore as mergeGoogleStore,
  saveEnrichmentStore as saveGoogleStore,
} from './lib/google-enrichment-store.mjs'
import {
  loadEnrichmentStore as loadOsmStore,
  mergePlaceIntoStore as mergeOsmStore,
  saveEnrichmentStore as saveOsmStore,
} from './lib/osm-enrichment-store.mjs'
import {
  hasOpeningHoursList,
  placeNeedsOpeningHoursEnrichment,
  resolveDisplayOpeningHours,
} from './lib/opening-hours.mjs'
import { filterByIds, parseExploreArgs, sliceExplorePage } from './lib/explore-page.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const placesJsonPath = path.resolve(__dirname, '../data/places.json')
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'
const apiKey = process.env.GOOGLE_PLACES_API_KEY
const osmDelayMs = Number(process.env.OSM_ENRICH_DELAY_MS || 1100)
const googleDelayMs = Number(process.env.GOOGLE_PLACES_DELAY_MS || 250)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseArgs() {
  const force = process.argv.includes('--force')
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0
  const categoryArg = process.argv.find((a) => a.startsWith('--category='))
  const category = categoryArg ? categoryArg.split('=')[1].trim().toUpperCase() : ''
  return { force, limit, category, ...parseExploreArgs() }
}

function matchesCategory(place, category) {
  if (!category) return true
  const cats = (place.categories || []).map((c) => String(c).toUpperCase())
  return cats.includes(category)
}

async function tryOsm(place) {
  const result = await enrichPlaceFromOsm(place)
  const patch = {}

  if (result.ok) {
    patch.osmOpeningHours = result.osmOpeningHours
    patch.osmId = result.osmId
    patch.osmMatchName = result.osmMatchName
    patch.osmEnrichedAt = result.osmEnrichedAt
    patch.openingHours = result.openingHours
    patch.openingHoursSource = 'osm'
    return { source: 'osm', patch, note: `${result.openingHours.length} lines` }
  }

  patch.osmEnrichedAt = new Date().toISOString()
  if (result.osmMatchName) patch.osmMatchName = result.osmMatchName
  return { source: null, patch, note: result.reason || 'osm_failed' }
}

async function tryGoogle(place) {
  if (!apiKey) {
    return { source: null, patch: {}, note: 'no_google_api_key' }
  }

  const result = await enrichPlaceFromGoogle(apiKey, place)
  if (!result.ok) {
    return { source: null, patch: {}, note: result.reason || 'google_failed' }
  }

  const patch = {
    googlePlaceId: result.googlePlaceId,
    googleRating: result.googleRating,
    googleReviewCount: result.googleReviewCount,
    googleMapsUri: result.googleMapsUri,
    googleDescription: result.googleDescription,
    googleEnrichedAt: result.googleEnrichedAt,
  }

  if (!hasOpeningHoursList(result.openingHours)) {
    return { source: null, patch, note: 'google_no_hours' }
  }

  patch.googleOpeningHours = result.openingHours
  patch.openingHours = result.openingHours
  patch.openingHoursSource = 'google'
  return { source: 'google', patch, note: `${result.openingHours.length} lines` }
}

async function main() {
  const { force, limit, category, page, pageSize, ids } = parseArgs()
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const collection = client.db(dbName).collection('places')
    let places = await collection.find({}).sort({ totalLikes: -1 }).toArray()

    places = filterByIds(places, ids)
    places = sliceExplorePage(places, { page, pageSize })
    places = places.filter(
      (p) => placeNeedsOpeningHoursEnrichment(p, { force }) && matchesCategory(p, category),
    )

    if (limit > 0) {
      places = places.slice(0, limit)
    }

    if (places.length === 0) {
      console.log('No places need opening hours (all have hours or use --force).')
      return
    }

    console.log(
      `Enriching opening hours for ${places.length} places (OSM → Google fallback)${category ? ` [${category}]` : ''}…`,
    )

    const googleStore = loadGoogleStore()
    const osmStore = loadOsmStore()
    let osmSaved = 0
    let googleSaved = 0
    let stillMissing = 0

    for (let i = 0; i < places.length; i++) {
      const place = places[i]
      const label = `${place._id} ${place.name} (${place.state || 'Malaysia'})`

      try {
        const osm = await tryOsm(place)
        let merged = resolveDisplayOpeningHours({ ...place, ...osm.patch })
        let source = osm.source
        let note = osm.note

        if (!hasOpeningHoursList(merged.openingHours)) {
          await sleep(googleDelayMs)
          const google = await tryGoogle(merged)
          merged = resolveDisplayOpeningHours({ ...merged, ...google.patch })
          if (google.source) {
            source = google.source
            note = `osm: ${osm.note} → google: ${google.note}`
          } else {
            note = `osm: ${osm.note} → google: ${google.note}`
          }
        }

        await collection.updateOne({ _id: place._id }, { $set: merged })
        mergeOsmStore(osmStore, merged)
        mergeGoogleStore(googleStore, merged)

        if (source === 'osm') osmSaved += 1
        else if (source === 'google') googleSaved += 1
        else stillMissing += 1

        const hoursPreview = hasOpeningHoursList(merged.openingHours)
          ? merged.openingHours[0]
          : 'none'
        console.log(
          `  [${i + 1}/${places.length}] ${source || 'miss'} — ${label} → ${hoursPreview} (${note})`,
        )
      } catch (err) {
        stillMissing += 1
        console.log(`  [${i + 1}/${places.length}] error — ${label}: ${err.message}`)
      }

      if (i < places.length - 1) await sleep(osmDelayMs)
    }

    saveOsmStore(osmStore)
    saveGoogleStore(googleStore)

    if (fs.existsSync(placesJsonPath)) {
      const all = await collection.find({}).toArray()
      const jsonPlaces = all.map(({ _id, ...rest }) => ({ _id, ...rest }))
      fs.writeFileSync(placesJsonPath, JSON.stringify(jsonPlaces, null, 2), 'utf8')
      console.log(`Synced ${jsonPlaces.length} places → ${placesJsonPath}`)
    }

    const withHours = await collection.countDocuments({
      $expr: { $gt: [{ $size: { $ifNull: ['$openingHours', []] } }, 0] },
    })
    console.log(
      `Done — OSM ${osmSaved}, Google fallback ${googleSaved}, still missing ${stillMissing}`,
    )
    console.log(`Database places with opening hours: ${withHours}`)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
