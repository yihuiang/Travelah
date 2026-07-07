import bcrypt from 'bcryptjs'
import { usersCollection } from './db.js'
import { allocateUserId } from './userId.js'
import { removeUserAvatars, presentAvatarUrl } from './avatar.js'
import { deleteAllConversationsForUser } from './conversations.js'
import {
  createTripForUser,
  deleteAllTripsForUser,
  getTripForUser,
  listTripsForUser,
  migrateEmbeddedTripsForUser,
  updateTripItineraryForUser,
} from './trips.js'

const SALT_ROUNDS = 10

/** Only avatars uploaded through Travelah (/avatars/…) are shown; not Google or other external URLs. */
function normalizeAvatarUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null
  return url.startsWith('/avatars/') ? url : null
}

export function ensureSavedItineraryIds(savedItineraries) {
  return (savedItineraries || []).map((item, index) => ({
    ...item,
    id: item.id || `trip-${index}`,
  }))
}

export function toPublicUser(doc, savedItineraries = undefined) {
  if (!doc) return null
  const { passwordHash, _id, userId: _legacyUserId, savedItineraries: _embedded, ...rest } = doc
  const id = typeof _id === 'string' ? _id : _id?.toString()
  return {
    id,
    username: rest.username,
    email: rest.email,
    displayName: rest.displayName,
    avatarUrl: presentAvatarUrl(rest.avatarUrl),
    memberSince: rest.memberSince || rest.createdAt,
    preferences: rest.preferences || {},
    settings: rest.settings || {},
    savedItineraries:
      savedItineraries !== undefined ? savedItineraries : ensureSavedItineraryIds(_embedded),
    savedPlaces: rest.savedPlaces || [],
    createdAt: rest.createdAt,
    updatedAt: rest.updatedAt,
  }
}

export async function toPublicUserWithTrips(doc) {
  if (!doc) return null
  const userId = typeof doc._id === 'string' ? doc._id : doc._id?.toString()
  const embedded = doc.savedItineraries || []
  if (embedded.length) {
    await migrateEmbeddedTripsForUser(userId, embedded)
  }
  const trips = await listTripsForUser(userId)
  return toPublicUser(doc, trips)
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain, passwordHash) {
  return bcrypt.compare(plain, passwordHash)
}

export async function findUserByUsername(username) {
  return usersCollection().findOne({ username: username.toLowerCase() })
}

export async function findUserByEmail(email) {
  return usersCollection().findOne({ email: email.toLowerCase() })
}

export async function resolveUniqueUsername(preferred) {
  const base = (preferred || 'traveler').trim().toLowerCase().replace(/\W/g, '') || 'traveler'
  let candidate = base.slice(0, 30)
  let suffix = 0
  while (await findUserByUsername(candidate)) {
    suffix += 1
    candidate = `${base.slice(0, 24)}${suffix}`
  }
  return candidate
}

export async function findUserByGoogleId(googleId) {
  return usersCollection().findOne({ googleId })
}

export async function createUser({ username, password, email, displayName, avatarUrl, preferences, settings }) {
  const normalizedUsername = await resolveUniqueUsername(username)

  if (email) {
    const emailTaken = await findUserByEmail(email)
    if (emailTaken) {
      const err = new Error('Email already registered')
      err.code = 'EMAIL_TAKEN'
      throw err
    }
  }

  const now = new Date()
  const id = await allocateUserId()
  const doc = {
    _id: id,
    username: normalizedUsername,
    email: email?.trim().toLowerCase() || null,
    passwordHash: await hashPassword(password),
    displayName: displayName?.trim() || normalizedUsername,
    avatarUrl: avatarUrl || null,
    memberSince: now,
    preferences: preferences || { pace: [], focus: [], dining: [], budget: [] },
    settings: settings || { language: 'en-GB', currency: 'MYR' },
    savedItineraries: [],
    savedPlaces: [],
    createdAt: now,
    updatedAt: now,
  }

  await usersCollection().insertOne(doc)
  return toPublicUser(doc)
}

export async function findOrCreateGoogleUser({ googleId, email, emailVerified, displayName }) {
  let user = await findUserByGoogleId(googleId)
  if (user) {
    if (user.avatarUrl && !user.avatarUrl.startsWith('/avatars/')) {
      await usersCollection().updateOne({ _id: user._id }, { $set: { avatarUrl: null, updatedAt: new Date() } })
      user = { ...user, avatarUrl: null }
    }
    return { user: await toPublicUserWithTrips(user), isNewUser: false }
  }

  if (email) {
    user = await findUserByEmail(email)
    if (user) {
      const $set = { googleId, updatedAt: new Date() }
      if (!user.email && emailVerified) $set.email = email
      if (!user.displayName && displayName) $set.displayName = displayName
      if (user.avatarUrl && !user.avatarUrl.startsWith('/avatars/')) $set.avatarUrl = null
      await usersCollection().updateOne({ _id: user._id }, { $set })
      return { user: await toPublicUserWithTrips(await findUserById(user._id)), isNewUser: false }
    }
  }

  const preferredUsername = email?.split('@')[0] || displayName || 'traveler'
  const normalizedUsername = await resolveUniqueUsername(preferredUsername)
  const now = new Date()
  const id = await allocateUserId()
  const doc = {
    _id: id,
    username: normalizedUsername,
    email: email && emailVerified ? email : null,
    googleId,
    passwordHash: null,
    displayName: displayName?.trim() || normalizedUsername,
    avatarUrl: null,
    memberSince: now,
    preferences: { pace: [], focus: [], dining: [], budget: [] },
    settings: { language: 'en-GB', currency: 'MYR' },
    savedItineraries: [],
    savedPlaces: [],
    createdAt: now,
    updatedAt: now,
  }

  await usersCollection().insertOne(doc)
  return { user: await toPublicUserWithTrips(doc), isNewUser: true }
}

export async function signInWithGoogle({ googleId, email, emailVerified, displayName }) {
  let user = await findUserByGoogleId(googleId)
  if (user) {
    if (user.avatarUrl && !user.avatarUrl.startsWith('/avatars/')) {
      await usersCollection().updateOne({ _id: user._id }, { $set: { avatarUrl: null, updatedAt: new Date() } })
      user = { ...user, avatarUrl: null }
    }
    return { user: await toPublicUserWithTrips(user), isNewUser: false }
  }

  if (email) {
    user = await findUserByEmail(email)
    if (user) {
      const $set = { googleId, updatedAt: new Date() }
      if (!user.email && emailVerified) $set.email = email
      if (!user.displayName && displayName) $set.displayName = displayName
      if (user.avatarUrl && !user.avatarUrl.startsWith('/avatars/')) $set.avatarUrl = null
      await usersCollection().updateOne({ _id: user._id }, { $set })
      return { user: await toPublicUserWithTrips(await findUserById(user._id)), isNewUser: false }
    }
  }

  const err = new Error('No account found for this Google email. Please create an account first.')
  err.code = 'ACCOUNT_NOT_FOUND'
  throw err
}

export async function findUserById(id) {
  return usersCollection().findOne({ _id: id })
}

export async function updateUserById(id, { preferences, settings, displayName, avatarUrl, email, currentPassword, newPassword }) {
  const user = await findUserById(id)
  if (!user) return null

  const $set = { updatedAt: new Date() }
  if (preferences) $set.preferences = preferences
  if (settings) $set.settings = settings
  if (displayName !== undefined && displayName !== null) {
    const trimmed = displayName.trim()
    if (!trimmed) {
      const err = new Error('Name cannot be empty')
      err.code = 'VALIDATION'
      throw err
    }
    $set.displayName = trimmed
  }
  if (avatarUrl !== undefined) $set.avatarUrl = avatarUrl

  if (email !== undefined) {
    const normalized = email?.trim().toLowerCase() || null
    if (normalized) {
      const existing = await findUserByEmail(normalized)
      if (existing && existing._id !== id) {
        const err = new Error('Email already registered')
        err.code = 'EMAIL_TAKEN'
        throw err
      }
    }
    $set.email = normalized
  }

  if (newPassword) {
    if (!currentPassword) {
      const err = new Error('Current password is required to set a new password')
      err.code = 'VALIDATION'
      throw err
    }
    const valid = await verifyPassword(currentPassword, user.passwordHash)
    if (!valid) {
      const err = new Error('Current password is incorrect')
      err.code = 'INVALID_PASSWORD'
      throw err
    }
    if (newPassword.length < 8) {
      const err = new Error('New password must be at least 8 characters')
      err.code = 'VALIDATION'
      throw err
    }
    $set.passwordHash = await hashPassword(newPassword)
  }

  await usersCollection().updateOne({ _id: id }, { $set })
  const doc = await findUserById(id)
  return toPublicUser(doc)
}

export async function findUserByLogin(login) {
  const normalized = login.trim().toLowerCase()
  if (normalized.includes('@')) {
    return findUserByEmail(normalized)
  }
  return findUserByUsername(normalized)
}

export async function authenticateUser(login, password) {
  const user = await findUserByLogin(login)
  if (!user) {
    const err = new Error('Invalid username or password')
    err.code = 'INVALID_CREDENTIALS'
    throw err
  }

  if (!user.passwordHash) {
    const err = new Error('This account uses Google sign-in. Please continue with Google.')
    err.code = 'GOOGLE_ACCOUNT'
    throw err
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    const err = new Error('Invalid username or password')
    err.code = 'INVALID_CREDENTIALS'
    throw err
  }

  return toPublicUserWithTrips(user)
}

function buildSavedPlaceSnapshot(place) {
  const state = place.state || 'Malaysia'
  return {
    placeId: place.id || place._id,
    title: place.name,
    description: place.description || place.googleDescription || '',
    image: place.coverImage || null,
    location: state === 'Malaysia' ? 'Malaysia' : `${state}, Malaysia`,
    savedAt: new Date(),
  }
}

export async function savePlaceForUser(userId, place) {
  const user = await findUserById(userId)
  if (!user) return null

  const placeId = place.id || place._id
  const alreadySaved = (user.savedPlaces || []).some((item) => item.placeId === placeId)
  if (alreadySaved) {
    return toPublicUser(user)
  }

  const snapshot = buildSavedPlaceSnapshot(place)
  await usersCollection().updateOne(
    { _id: userId },
    {
      $push: { savedPlaces: snapshot },
      $set: { updatedAt: new Date() },
    },
  )
  const doc = await findUserById(userId)
  return toPublicUser(doc)
}

export async function unsavePlaceForUser(userId, placeId) {
  const user = await findUserById(userId)
  if (!user) return null

  await usersCollection().updateOne(
    { _id: userId },
    {
      $pull: { savedPlaces: { placeId } },
      $set: { updatedAt: new Date() },
    },
  )
  const doc = await findUserById(userId)
  return toPublicUser(doc)
}

export function userHasSavedPlace(user, placeId) {
  return (user?.savedPlaces || []).some((item) => item.placeId === placeId)
}

export async function getSavedItineraryForUser(userId, tripId) {
  const trip = await getTripForUser(userId, tripId)
  if (trip) return trip

  const user = await findUserById(userId)
  if (!user) return null

  const items = ensureSavedItineraryIds(user.savedItineraries)
  const byId = items.find((item) => item.id === tripId)
  if (byId) {
    await migrateEmbeddedTripsForUser(userId, [byId])
    return getTripForUser(userId, tripId)
  }

  const indexMatch = String(tripId).match(/^trip-(\d+)$/)
  if (indexMatch) {
    const idx = Number.parseInt(indexMatch[1], 10)
    const byIndex = items[idx]
    if (byIndex) {
      await migrateEmbeddedTripsForUser(userId, [{ ...byIndex, id: tripId }])
      return getTripForUser(userId, tripId)
    }
  }

  return null
}

export async function updateSavedTripItinerary(userId, tripId, itinerary) {
  const updated = await updateTripItineraryForUser(userId, tripId, itinerary)
  if (updated) {
    const doc = await findUserById(userId)
    return toPublicUserWithTrips(doc)
  }

  const user = await findUserById(userId)
  if (!user) return null

  const items = user.savedItineraries || []
  let arrayIndex = items.findIndex((item) => item.id === tripId)
  if (arrayIndex < 0) {
    const indexMatch = String(tripId).match(/^trip-(\d+)$/)
    if (indexMatch) arrayIndex = Number.parseInt(indexMatch[1], 10)
  }
  if (arrayIndex < 0 || arrayIndex >= items.length) return null

  const setFields = {
    [`savedItineraries.${arrayIndex}.itinerary`]: itinerary,
    updatedAt: new Date(),
  }
  if (!items[arrayIndex].id) {
    setFields[`savedItineraries.${arrayIndex}.id`] = tripId
  }

  await usersCollection().updateOne({ _id: userId }, { $set: setFields })
  await migrateEmbeddedTripsForUser(userId, user.savedItineraries || [])
  return updateTripItineraryForUser(userId, tripId, itinerary).then(async () => {
    const doc = await findUserById(userId)
    return toPublicUserWithTrips(doc)
  })
}

export async function saveItineraryForUser(userId, payload) {
  const user = await findUserById(userId)
  if (!user) return null

  await createTripForUser(userId, payload)
  return toPublicUserWithTrips(user)
}

export async function deleteUserAccount(userId) {
  const user = await findUserById(userId)
  if (!user) return false

  await deleteAllTripsForUser(userId)
  await deleteAllConversationsForUser(userId)
  await removeUserAvatars(userId)

  const result = await usersCollection().deleteOne({ _id: userId })
  return result.deletedCount > 0
}
