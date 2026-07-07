/**
 * Enrich MongoDB places with opening hours from OpenStreetMap (Nominatim + Overpass).
 *
 * Usage:
 *   npm run enrich:places-osm -- --limit=10
 *   npm run enrich:places-osm
 *   npm run enrich:places-osm -- --force
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import { enrichPlaceFromOsm } from './lib/osm-overpass.mjs'
import {
  loadEnrichmentStore,
  mergePlaceIntoStore,
  saveEnrichmentStore,
} from './lib/osm-enrichment-store.mjs'
import { hasOpeningHoursList, placeNeedsOpeningHoursEnrichment } from './lib/opening-hours.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const placesJsonPath = path.resolve(__dirname, '../data/places.json')
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'
const delayMs = Number(process.env.OSM_ENRICH_DELAY_MS || 1100)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseArgs() {
  const force = process.argv.includes('--force')
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0
  const onlyMissingHours = !process.argv.includes('--include-with-hours')
  return { force, limit, onlyMissingHours }
}

function needsOsmHours(place, { force }) {
  return placeNeedsOpeningHoursEnrichment(place, { force })
}

async function main() {
  const { force, limit } = parseArgs()
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const collection = client.db(dbName).collection('places')
    let places = await collection.find({}).sort({ totalLikes: -1 }).toArray()
    places = places.filter((p) => needsOsmHours(p, { force }))

    if (limit > 0) {
      places = places.slice(0, limit)
    }

    if (places.length === 0) {
      console.log('No places to enrich via OSM. Use --force or check MongoDB.')
      return
    }

    console.log(`Enriching ${places.length} places via OSM (Nominatim + Overpass)…`)
    let saved = 0
    let failed = 0
    const enrichmentStore = loadEnrichmentStore()

    for (let i = 0; i < places.length; i++) {
      const place = places[i]
      const label = `${place._id} ${place.name} (${place.state || 'Malaysia'})`
      try {
        const result = await enrichPlaceFromOsm(place)
        const patch = {}

        if (result.ok) {
          patch.osmOpeningHours = result.osmOpeningHours
          patch.osmId = result.osmId
          patch.osmMatchName = result.osmMatchName
          patch.osmEnrichedAt = result.osmEnrichedAt
          patch.openingHours = result.openingHours
          patch.openingHoursSource = 'osm'

          await collection.updateOne({ _id: place._id }, { $set: patch })
          mergePlaceIntoStore(enrichmentStore, { ...place, ...patch })
          saved += 1
          console.log(
            `  [${i + 1}/${places.length}] ok — ${label} → ${result.openingHours.length} lines (${result.osmId || 'nominatim'})`,
          )
        } else if (result.reason === 'no_opening_hours') {
          patch.osmEnrichedAt = new Date().toISOString()
          patch.osmMatchName = result.osmMatchName || null
          await collection.updateOne({ _id: place._id }, { $set: patch })
          mergePlaceIntoStore(enrichmentStore, { ...place, ...patch })
          failed += 1
          console.log(`  [${i + 1}/${places.length}] skip — ${label}: matched but no opening_hours tag`)
        } else {
          failed += 1
          console.log(`  [${i + 1}/${places.length}] skip — ${label}: ${result.reason}`)
        }
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

    console.log(`Done — OSM hours saved ${saved}, failed/skipped ${failed}`)
    console.log(`Store: ${path.resolve(__dirname, '../data/places-osm-enrichment.json')}`)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
