/**
 * Pull Google enrichment from places.json + MongoDB into the sidecar store.
 * Run after manual fixes or enrich:places-google so ratings/hours survive re-seeds.
 *
 * Usage: npm run sync:google-enrichment
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import {
  hasGoogleEnrichment,
  loadEnrichmentStore,
  mergePlacesIntoStore,
  saveEnrichmentStore,
} from './lib/google-enrichment-store.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const placesJsonPath = path.resolve(__dirname, '../data/places.json')
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'

async function main() {
  const store = loadEnrichmentStore()
  const before = Object.keys(store).length

  if (fs.existsSync(placesJsonPath)) {
    const fromJson = JSON.parse(fs.readFileSync(placesJsonPath, 'utf8'))
    const enriched = fromJson.filter(hasGoogleEnrichment)
    mergePlacesIntoStore(store, enriched)
    console.log(`From places.json: ${enriched.length} with Google rating/hours/placeId`)
  }

  const client = new MongoClient(uri)
  try {
    await client.connect()
    const fromDb = await client
      .db(dbName)
      .collection('places')
      .find({
        $or: [
          { googleEnrichedAt: { $exists: true, $ne: null } },
          { googleRating: { $exists: true, $ne: null } },
          { googlePlaceId: { $exists: true, $ne: null } },
          { openingHours: { $exists: true, $not: { $size: 0 } } },
        ],
      })
      .toArray()
    mergePlacesIntoStore(store, fromDb)
    console.log(`From MongoDB: ${fromDb.length} with Google enrichment`)
  } finally {
    await client.close()
  }

  saveEnrichmentStore(store)
  console.log(`Store keys: ${before} → ${Object.keys(store).length}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
