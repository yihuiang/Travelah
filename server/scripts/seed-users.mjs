/**
 * Load users.seed.json into MongoDB (travelah.users).
 * Passwords in the seed file are hashed before storage — never stored as plain text.
 *
 * Usage: npm run seed:users
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const seedPath = path.resolve(__dirname, '../data/users.seed.json')

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'
const SALT_ROUNDS = 10

async function main() {
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Missing ${seedPath}`)
  }

  const users = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const collection = client.db(dbName).collection('users')

    try {
      await collection.dropIndex('userId_1')
    } catch {
      /* index may not exist */
    }
    await collection.createIndex({ username: 1 }, { unique: true })
    await collection.createIndex({ email: 1 }, { unique: true, sparse: true })

    const now = new Date()
    for (let i = 0; i < users.length; i++) {
      const entry = users[i]
      const username = entry.username.trim().toLowerCase()
      const id = entry._id || entry.userId || `U${String(i + 1).padStart(2, '0')}`
      const passwordHash = await bcrypt.hash(entry.password, SALT_ROUNDS)
      const memberSince = entry.memberSince ? new Date(entry.memberSince) : now

      // Remove legacy rows (ObjectId _id or duplicate userId field)
      await collection.deleteMany({
        $or: [{ username }, { _id: id }],
        _id: { $ne: id },
      })

      await collection.replaceOne(
        { _id: id },
        {
          _id: id,
          username,
          email: entry.email?.trim().toLowerCase() || null,
          passwordHash,
          displayName: entry.displayName || username,
          avatarUrl: entry.avatarUrl || null,
          memberSince,
          preferences: entry.preferences || {},
          settings: entry.settings || { language: 'en-GB', currency: 'MYR' },
          savedItineraries: entry.savedItineraries || [],
          createdAt: memberSince,
          updatedAt: now,
        },
        { upsert: true },
      )
    }

    await collection.updateMany({}, { $unset: { userId: '' } })

    const total = await collection.countDocuments()
    console.log(`Seeded ${users.length} user(s) from users.seed.json`)
    console.log(`Database: ${dbName}  Collection: users  Total documents: ${total}`)
    console.log(`Demo login: username "esterling" / password "travelah123"`)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
