/**
 * Re-link stale placeId references after the move to stable place IDs.
 *
 * Older place IDs were sequential (P01, P02, ...) and reshuffled on every
 * re-extract/re-seed, so saved trips and saved places could point to the wrong
 * place. This walks saved trips and users' saved places and re-links each
 * placeId by matching the stored name + state to the current places collection.
 *
 * Safe to run multiple times. Usage: npm run migrate:place-ids
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') })

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function stateFromLocation(location) {
  // saved place "location" looks like "Penang, Malaysia" or "Malaysia"
  const first = String(location || '').split(',')[0].trim()
  return first && first.toLowerCase() !== 'malaysia' ? first : 'Malaysia'
}

async function main() {
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db(dbName)
    const placesCol = db.collection('places')
    const tripsCol = db.collection('trips')
    const usersCol = db.collection('users')

    const places = await placesCol.find({}, { projection: { _id: 1, name: 1, state: 1 } }).toArray()

    const idSet = new Set(places.map((p) => p._id))
    const nameStateToId = new Map()
    const nameToIds = new Map()
    for (const p of places) {
      const n = norm(p.name)
      const key = `${n}|${norm(p.state || 'Malaysia')}`
      if (!nameStateToId.has(key)) nameStateToId.set(key, p._id)
      if (!nameToIds.has(n)) nameToIds.set(n, [])
      nameToIds.get(n).push(p._id)
    }

    const resolveId = (name, state) => {
      const n = norm(name)
      if (!n) return null
      const byState = nameStateToId.get(`${n}|${norm(state || 'Malaysia')}`)
      if (byState) return byState
      const candidates = nameToIds.get(n)
      if (candidates && candidates.length === 1) return candidates[0]
      return null
    }

    // --- Trips ---
    const trips = await tripsCol.find({ 'itinerary.days': { $exists: true } }).toArray()
    let tripsUpdated = 0
    let stopsRelinked = 0

    for (const trip of trips) {
      let changed = false
      const days = trip.itinerary?.days || []
      for (const day of days) {
        for (const activity of day.activities || []) {
          if (!activity || activity.connector) continue
          if (!activity.placeId || !activity.name) continue
          if (idSet.has(activity.placeId)) continue // already valid

          const resolved = resolveId(activity.name, activity.state || day.destination)
          if (resolved && resolved !== activity.placeId) {
            activity.placeId = resolved
            stopsRelinked += 1
            changed = true
          }
        }
      }
      if (changed) {
        await tripsCol.updateOne(
          { _id: trip._id },
          { $set: { itinerary: trip.itinerary, updatedAt: new Date() } },
        )
        tripsUpdated += 1
      }
    }

    // --- Users' saved places ---
    const users = await usersCol.find({ savedPlaces: { $exists: true, $ne: [] } }).toArray()
    let usersUpdated = 0
    let savedRelinked = 0

    for (const user of users) {
      let changed = false
      const savedPlaces = (user.savedPlaces || []).map((item) => {
        if (!item?.placeId || idSet.has(item.placeId)) return item
        const resolved = resolveId(item.title, stateFromLocation(item.location))
        if (resolved && resolved !== item.placeId) {
          savedRelinked += 1
          changed = true
          return { ...item, placeId: resolved }
        }
        return item
      })
      if (changed) {
        await usersCol.updateOne(
          { _id: user._id },
          { $set: { savedPlaces, updatedAt: new Date() } },
        )
        usersUpdated += 1
      }
    }

    console.log(`Places loaded: ${places.length}`)
    console.log(`Trips updated: ${tripsUpdated} (stops relinked: ${stopsRelinked})`)
    console.log(`Users updated: ${usersUpdated} (saved places relinked: ${savedRelinked})`)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
