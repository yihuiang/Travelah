/**
 * Load locations.json into MongoDB (travelah.locations).
 *
 * Usage: npm run seed:locations
 * Then:  npm run tag:place-locations
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const locationsPath = path.resolve(__dirname, '../data/locations.json')

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'

async function main() {
  if (!fs.existsSync(locationsPath)) {
    throw new Error(`Missing ${locationsPath}`)
  }

  const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'))
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const collection = client.db(dbName).collection('locations')

    await collection.createIndex({ type: 1, state: 1 })
    await collection.createIndex({ parentId: 1 })
    await collection.createIndex({ name: 1 })
    await collection.createIndex({ featured: 1 })

    const now = new Date()
    const seedIds = locations.map((location) => location._id)
    const existing = await collection.find({ _id: { $in: seedIds } }).project({ _id: 1, placeCount: 1 }).toArray()
    const placeCountById = Object.fromEntries(existing.map((doc) => [doc._id, doc.placeCount || 0]))

    const ops = locations.map((location) => ({
      replaceOne: {
        filter: { _id: location._id },
        replacement: {
          ...location,
          placeCount: placeCountById[location._id] ?? location.placeCount ?? 0,
          updatedAt: now,
          createdAt: location.createdAt || now,
        },
        upsert: true,
      },
    }))

    if (ops.length > 0) {
      await collection.bulkWrite(ops, { ordered: false })
    }

    const removed = await collection.deleteMany({ _id: { $nin: seedIds } })

    const total = await collection.countDocuments()
    console.log(`Seeded ${locations.length} locations`)
    if (removed.deletedCount > 0) {
      console.log(`Removed ${removed.deletedCount} stale location(s)`)
    }
    console.log(`Database: ${dbName}  Collection: locations  Total documents: ${total}`)
    console.log('Next: npm run tag:place-locations')
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
