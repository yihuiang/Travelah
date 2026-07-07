/**
 * Load heritage.json into MongoDB (travelah.heritage).
 *
 * Usage: npm run seed:heritage
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const heritagePath = path.resolve(__dirname, '../data/heritage.json')
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'

async function main() {
  if (!fs.existsSync(heritagePath)) {
    throw new Error(`Missing ${heritagePath}`)
  }

  const sites = JSON.parse(fs.readFileSync(heritagePath, 'utf8'))
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const collection = client.db(dbName).collection('heritage')

    await collection.createIndex({ state: 1 })

    await collection.deleteMany({})

    const now = new Date()
    const ops = sites.map((site) => ({
      replaceOne: {
        filter: { _id: site._id },
        replacement: { ...site, updatedAt: now, createdAt: site.createdAt || now },
        upsert: true,
      },
    }))
    if (ops.length) await collection.bulkWrite(ops, { ordered: false })

    const total = await collection.countDocuments()
    console.log(`Seeded ${sites.length} heritage sites from heritage.json`)
    console.log(`Database: ${dbName}  Collection: heritage  Total documents: ${total}`)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
