import crypto from 'crypto'
import { passwordResetTokensCollection, usersCollection } from './db.js'
import { findUserByEmail, hashPassword } from './users.js'

const TOKEN_BYTES = 32
const EXPIRE_MS = 60 * 60 * 1000 // 1 hour

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function ensurePasswordResetIndexes() {
  const col = passwordResetTokensCollection()
  await col.createIndex({ userId: 1 })
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
}

export async function createPasswordResetToken(email) {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return { ok: true, token: null, userId: null }

  const user = await findUserByEmail(normalized)
  if (!user || !user.passwordHash) {
    // No password account (e.g. Google-only) — same response shape for privacy.
    return { ok: true, token: null, userId: null }
  }

  const userId = typeof user._id === 'string' ? user._id : user._id?.toString()
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex')
  const now = new Date()

  await passwordResetTokensCollection().deleteMany({ userId })

  await passwordResetTokensCollection().insertOne({
    _id: hashToken(token),
    userId,
    email: normalized,
    createdAt: now,
    expiresAt: new Date(now.getTime() + EXPIRE_MS),
  })

  return { ok: true, token, userId }
}

export async function resetPasswordWithToken(token, newPassword) {
  if (!token || typeof token !== 'string') {
    const err = new Error('Invalid or expired reset link')
    err.code = 'INVALID_TOKEN'
    throw err
  }
  if (!newPassword || newPassword.length < 8) {
    const err = new Error('Password must be at least 8 characters')
    err.code = 'VALIDATION'
    throw err
  }

  const doc = await passwordResetTokensCollection().findOne({ _id: hashToken(token) })
  if (!doc || doc.expiresAt < new Date()) {
    const err = new Error('Invalid or expired reset link')
    err.code = 'INVALID_TOKEN'
    throw err
  }

  const passwordHash = await hashPassword(newPassword)
  const result = await usersCollection().updateOne(
    { _id: doc.userId },
    { $set: { passwordHash, updatedAt: new Date() } },
  )
  if (!result.matchedCount) {
    const err = new Error('Account not found')
    err.code = 'NOT_FOUND'
    throw err
  }

  await passwordResetTokensCollection().deleteMany({ userId: doc.userId })
  return { ok: true }
}
