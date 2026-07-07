import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { connectDb, usersCollection, closeDb } from '../src/db.js'
import { migrateEmbeddedTripsForUser, listTripsForUser } from '../src/trips.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

async function main() {
  await connectDb()
  const users = await usersCollection().find({}).toArray()
  let totalMigrated = 0

  for (const user of users) {
    const userId = typeof user._id === 'string' ? user._id : user._id?.toString()
    const embedded = user.savedItineraries || []
    if (!embedded.length) continue

    const migrated = await migrateEmbeddedTripsForUser(userId, embedded)
    const count = await listTripsForUser(userId)
    totalMigrated += migrated
    console.log(`${user.username} (${userId}): migrated ${migrated} new, ${count.length} total in trips collection`)
  }

  console.log(`\nDone. ${totalMigrated} trip(s) migrated into the trips collection.`)
  await closeDb()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
