import crypto from 'crypto'
import { tripInvitesCollection } from './db.js'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LEN = 6
const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MAX_USES = 50

function genCode() {
  const bytes = crypto.randomBytes(CODE_LEN)
  let code = ''
  for (let i = 0; i < CODE_LEN; i++) code += CODE_CHARS[bytes[i] % CODE_CHARS.length]
  return code
}

export async function ensureInviteIndexes() {
  const col = tripInvitesCollection()
  await col.createIndex({ tripId: 1 })
  // TTL index — MongoDB auto-deletes expired docs
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
}

export async function getOrCreateInviteCode(tripId, userId) {
  const col = tripInvitesCollection()
  const now = new Date()

  // Reuse existing valid code for this trip
  const existing = await col.findOne({
    tripId,
    expiresAt: { $gt: now },
    useCount: { $lt: MAX_USES },
  })
  if (existing) return existing

  // Generate a unique code
  let code
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = genCode()
    const conflict = await col.findOne({ _id: candidate })
    if (!conflict) { code = candidate; break }
  }
  if (!code) throw new Error('Could not generate unique invite code')

  const doc = {
    _id: code,
    tripId,
    createdBy: userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + EXPIRE_MS),
    useCount: 0,
    maxUses: MAX_USES,
  }
  await col.insertOne(doc)
  return doc
}

export async function resolveInviteCode(code) {
  if (!code || typeof code !== 'string') return null
  const doc = await tripInvitesCollection().findOne({ _id: code.toUpperCase() })
  if (!doc) return null
  if (doc.expiresAt < new Date()) return null
  if (doc.useCount >= doc.maxUses) return null
  return doc
}

export async function incrementUseCount(code) {
  await tripInvitesCollection().updateOne(
    { _id: code.toUpperCase() },
    { $inc: { useCount: 1 } },
  )
}
