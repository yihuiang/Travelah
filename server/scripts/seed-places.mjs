/**
 * Load places.json into MongoDB (travelah.places).
 * Merges persisted Google enrichment so re-seeds do not wipe ratings/hours.
 *
 * Usage: npm run seed:places
 * Prerequisite: python nlp/extract_places.py
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import {
  applyEnrichmentToPlaces,
  loadEnrichmentStore,
  mergePlacesIntoStore,
  saveEnrichmentStore,
} from './lib/google-enrichment-store.mjs'
import {
  applyEnrichmentToPlaces as applyOsmEnrichmentToPlaces,
  loadEnrichmentStore as loadOsmEnrichmentStore,
  mergePlacesIntoStore as mergeOsmPlacesIntoStore,
  saveEnrichmentStore as saveOsmEnrichmentStore,
} from './lib/osm-enrichment-store.mjs'
import { resolveDisplayOpeningHours } from './lib/opening-hours.mjs'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const placesPath = path.resolve(__dirname, '../data/places.json')

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'

async function main() {
  if (!fs.existsSync(placesPath)) {
    throw new Error(`Missing ${placesPath}. Run: cd nlp && python extract_places.py`)
  }

  const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'))
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const collection = client.db(dbName).collection('places')

    const enrichmentStore = loadEnrichmentStore()
    const osmStore = loadOsmEnrichmentStore()
    const existingEnriched = await collection
      .find({ googleEnrichedAt: { $exists: true, $ne: null } })
      .toArray()
    const existingOsm = await collection
      .find({ osmEnrichedAt: { $exists: true, $ne: null } })
      .toArray()
    mergePlacesIntoStore(enrichmentStore, existingEnriched)
    mergePlacesIntoStore(enrichmentStore, places)
    mergeOsmPlacesIntoStore(osmStore, existingOsm)
    mergeOsmPlacesIntoStore(osmStore, places)

    const withGoogle = applyEnrichmentToPlaces(places, enrichmentStore)
    const enrichedPlaces = applyOsmEnrichmentToPlaces(withGoogle, osmStore).map(resolveDisplayOpeningHours)
    saveEnrichmentStore(enrichmentStore)
    saveOsmEnrichmentStore(osmStore)

    await collection.createIndex({ totalLikes: -1 })
    await collection.createIndex({ state: 1 })
    await collection.createIndex({ name: 1 })

    await collection.deleteMany({})

    const now = new Date()
    const ops = enrichedPlaces.map((place) => ({
      replaceOne: {
        filter: { _id: place._id },
        replacement: {
          ...place,
          updatedAt: now,
          createdAt: place.createdAt || now,
        },
        upsert: true,
      },
    }))

    const BATCH = 500
    for (let i = 0; i < ops.length; i += BATCH) {
      await collection.bulkWrite(ops.slice(i, i + BATCH), { ordered: false })
    }

    const total = await collection.countDocuments()
    const enrichedCount = enrichedPlaces.filter((p) => p.googleEnrichedAt).length
    const osmCount = enrichedPlaces.filter((p) => p.openingHoursSource === 'osm').length
    const googleHoursCount = enrichedPlaces.filter((p) => p.openingHoursSource === 'google').length
    console.log(`Seeded ${enrichedPlaces.length} places from places.json`)
    console.log(`Google enrichment restored on ${enrichedCount} places`)
    console.log(`Opening hours: ${osmCount} OSM, ${googleHoursCount} Google fallback`)
    console.log(`Database: ${dbName}  Collection: places  Total documents: ${total}`)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
