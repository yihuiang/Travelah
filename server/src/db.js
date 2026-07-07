import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'

let client
let db

let indexesEnsured = false

export async function ensureUserIndexes() {
  const col = getDb().collection('users')
  const indexes = await col.indexes()
  if (indexes.some((idx) => idx.name === 'userId_1')) {
    await col.dropIndex('userId_1')
    console.log('Dropped legacy users.userId index')
  }
  await col.createIndex({ username: 1 }, { unique: true })
  await col.createIndex({ email: 1 }, { unique: true, sparse: true })
  await col.createIndex({ googleId: 1 }, { unique: true, sparse: true })
}

export async function ensureTripIndexes() {
  const col = getDb().collection('trips')
  await col.createIndex({ userId: 1, createdAt: -1 })
  await col.createIndex({ userId: 1, updatedAt: -1 })
}

export async function connectDb() {
  if (db) return db
  client = new MongoClient(uri)
  await client.connect()
  db = client.db(dbName)
  if (!indexesEnsured) {
    await ensureUserIndexes()
    await ensureTripIndexes()
    indexesEnsured = true
  }
  return db
}

export function getDb() {
  if (!db) throw new Error('Database not connected. Call connectDb() first.')
  return db
}

export async function closeDb() {
  if (client) {
    await client.close()
    client = undefined
    db = undefined
  }
}

export function postsCollection() {
  return getDb().collection('posts')
}

export function usersCollection() {
  return getDb().collection('users')
}

export function placesCollection() {
  return getDb().collection('places')
}

export function locationsCollection() {
  return getDb().collection('locations')
}

export function tripsCollection() {
  return getDb().collection('trips')
}

export function tripInvitesCollection() {
  return getDb().collection('tripInvites')
}

export function conversationsCollection() {
  return getDb().collection('conversations')
}

export function heritageCollection() {
  return getDb().collection('heritage')
}

export function passwordResetTokensCollection() {
  return getDb().collection('passwordResetTokens')
}
