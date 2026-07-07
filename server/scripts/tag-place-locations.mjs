/**
 * Tag each place with locationIds[] and refresh placeCount on locations.
 *
 * Usage: npm run tag:place-locations
 * Prerequisite: npm run seed:locations && npm run seed:places
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import { tagPlaceLocationIds } from '../src/locations.js'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const placesPath = path.resolve(__dirname, '../data/places.json')
const locationsPath = path.resolve(__dirname, '../data/locations.json')

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'

async function loadPlaces(collection) {
  const docs = await collection.find({}).toArray()
  if (docs.length > 0) return docs
  if (!fs.existsSync(placesPath)) {
    throw new Error(`No places in MongoDB and missing ${placesPath}`)
  }
  return JSON.parse(fs.readFileSync(placesPath, 'utf8'))
}

async function loadLocations(collection) {
  const docs = await collection.find({}).toArray()
  if (docs.length > 0) return docs
  if (!fs.existsSync(locationsPath)) {
    throw new Error(`No locations in MongoDB and missing ${locationsPath}`)
  }
  return JSON.parse(fs.readFileSync(locationsPath, 'utf8'))
}

async function main() {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(dbName)
    const placesCol = db.collection('places')
    const locationsCol = db.collection('locations')

    const places = await loadPlaces(placesCol)
    const locations = await loadLocations(locationsCol)

    const counts = Object.fromEntries(locations.map((loc) => [loc._id, 0]))
    const now = new Date()
    const placeOps = []

    for (const place of places) {
      const locationIds = tagPlaceLocationIds(place, locations)
      for (const id of locationIds) {
        counts[id] = (counts[id] || 0) + 1
      }
      placeOps.push({
        updateOne: {
          filter: { _id: place._id },
          update: { $set: { locationIds, updatedAt: now } },
        },
      })
    }

    await placesCol.createIndex({ locationIds: 1 })

    const BATCH = 500
    for (let i = 0; i < placeOps.length; i += BATCH) {
      await placesCol.bulkWrite(placeOps.slice(i, i + BATCH), { ordered: false })
    }

    const locationOps = locations.map((location) => ({
      updateOne: {
        filter: { _id: location._id },
        update: {
          $set: {
            placeCount: counts[location._id] || 0,
            updatedAt: now,
          },
        },
      },
    }))

    if (locationOps.length > 0) {
      await locationsCol.bulkWrite(locationOps, { ordered: false })
    }

    const active = locations.filter((loc) => (counts[loc._id] || 0) >= (loc.minPlaces ?? 3))
    console.log(`Tagged ${places.length} places with locationIds`)
    console.log(`${active.length}/${locations.length} locations meet minPlaces threshold`)
    console.log('Top locations:')
    for (const loc of [...locations].sort((a, b) => (counts[b._id] || 0) - (counts[a._id] || 0)).slice(0, 12)) {
      console.log(`  ${loc.name}: ${counts[loc._id] || 0}`)
    }
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
