import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { translateText, translateBatch, saveCacheToDisk } from './translate.js'
import { connectDb, postsCollection, usersCollection, placesCollection, locationsCollection, heritageCollection } from './db.js'
import { resolvePublicAssetUrl } from './resolvePublicAsset.js'
import { authMiddleware, optionalAuth, signToken } from './auth.js'
import {
  createConversation,
  appendToConversation,
  getConversationMessages,
  listConversations,
  deleteConversation,
} from './conversations.js'
import { getGoogleOAuthClientId, isGoogleAuthConfigured, verifyGoogleIdToken } from './googleAuth.js'
import {
  authenticateUser,
  createUser,
  findOrCreateGoogleUser,
  signInWithGoogle,
  findUserById,
  findUserByUsername,
  savePlaceForUser,
  saveItineraryForUser,
  getSavedItineraryForUser,
  updateSavedTripItinerary,
  toPublicUser,
  toPublicUserWithTrips,
  unsavePlaceForUser,
  updateUserById,
  userHasSavedPlace,
  deleteUserAccount,
} from './users.js'
import {
  createTripForUser,
  getTripForUser,
  listTripsForUser,
  updateTripForUser,
  updateTripItineraryForUser,
  updateTripPackingListForUser,
  updateTripBudgetForUser,
  updateTripBudgetCurrencyForUser,
  deleteTripForUser,
  getTripBasicInfo,
  addTripMember,
  removeTripMember,
  isTripOwnerOrMember,
} from './trips.js'
import {
  getOrCreateInviteCode,
  resolveInviteCode,
  incrementUseCount,
  ensureInviteIndexes,
} from './tripInvites.js'
import { getClientOrigin } from './clientUrl.js'
import { createPasswordResetToken, resetPasswordWithToken, ensurePasswordResetIndexes } from './passwordReset.js'
import { isPasswordResetEmailConfigured, sendPasswordResetEmail } from './email.js'
import { downloadPostImage, localPostImagePath, streamPostImage } from '../scripts/lib/download-post-image.mjs'
import { filterLinkedPlacePosts, isFestivalPlace } from '../scripts/lib/post-quality.mjs'
import { generateItineraryFromPlaces } from './generateItinerary.js'
import { parsePlanNotes } from './parsePlanNotes.js'
import { isConciergeConfigured, extractTripIntent } from './aiConcierge.js'
import { isGooglePlacesConfigured, getGooglePlaceDetails, searchGooglePlaces, searchGoogleTransportPlaces } from './googlePlaces.js'
import { resolveItineraryStops } from './mapGeocode.js'
import { computeTravelLegs } from './travelTime.js'
import {
  activeDestinationPart,
  listLocations,
  suggestDestinations,
  validateDestinationQuery,
} from './locations.js'
import multer from 'multer'
import {
  isAllowedImage,
  presentAvatarUrl,
  removeUserAvatars,
  saveUserAvatar,
} from './avatar.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mergedDataPath = path.resolve(__dirname, '../data/merged-data.json')
const placesDataPath = path.resolve(__dirname, '../data/places.json')
const heritageDataPath = path.resolve(__dirname, '../data/heritage.json')
const locationsDataPath = path.resolve(__dirname, '../data/locations.json')
const localesPath = path.resolve(__dirname, '../data/trending-locales.json')
const TRENDING_SOURCE_LANG = 'zh-CN'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!isAllowedImage(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'))
      return
    }
    cb(null, true)
  },
})

function loadLocales() {
  try {
    return JSON.parse(fs.readFileSync(localesPath, 'utf8'))
  } catch {
    return {}
  }
}

function loadTrendingFromFile() {
  try {
    return JSON.parse(fs.readFileSync(mergedDataPath, 'utf8'))
  } catch {
    return []
  }
}

function applyLocale(item, lang, locales) {
  if (lang === TRENDING_SOURCE_LANG) return item

  const key = item.id || item.postId
  const localized = locales[key]?.[lang]
  if (localized) {
    return {
      ...item,
      title: localized.title ?? item.title,
      description: localized.description ?? item.description,
      category: localized.category ?? item.category,
      location: localized.location ?? item.location,
      likesLabel: localized.likesLabel ?? item.likesLabel,
    }
  }

  const i18n = item.i18n?.[lang]
  if (i18n) {
    return {
      ...item,
      title: i18n.title ?? item.title,
      description: i18n.description ?? item.description,
      category: i18n.category ?? item.category,
      location: i18n.location ?? item.location,
      likesLabel: i18n.likesLabel ?? item.likesLabel,
    }
  }

  return item
}

function stripMongoFields(doc) {
  if (!doc) return doc
  const { _id, ...rest } = doc
  const out = { ...rest, id: rest.id || rest.postId }
  if (out.imageLocal) out.imageLocal = resolvePublicAssetUrl(out.imageLocal)
  return out
}

function stripPlaceFields(doc) {
  if (!doc) return doc
  const { _id, extractSources, ...rest } = doc
  const out = { ...rest, id: _id }
  if (out.coverImage) out.coverImage = resolvePublicAssetUrl(out.coverImage)
  if (out.image) out.image = resolvePublicAssetUrl(out.image)
  return out
}

function loadPlacesFromFile() {
  try {
    return JSON.parse(fs.readFileSync(placesDataPath, 'utf8'))
  } catch {
    return []
  }
}

// Curated heritage sites. heritage.json is the seed SOURCE (run seed:heritage);
// the served data lives in the MongoDB `heritage` collection, with the file as
// a fallback. Shaped like place records so save + detail reuse place plumbing.
function loadHeritageFromFile() {
  try {
    return JSON.parse(fs.readFileSync(heritageDataPath, 'utf8'))
  } catch {
    return []
  }
}

async function loadHeritage() {
  try {
    const docs = await heritageCollection().find({}).toArray()
    if (docs.length > 0) return docs.map(stripPlaceFields)
  } catch {
    // fall through to the seed file
  }
  return loadHeritageFromFile().map(stripPlaceFields)
}

async function loadPlaces({ limit, state, category, q }) {
  const query = {}
  if (state && state !== 'ALL STATES') query.state = state
  if (category && category !== 'ALL') query.categories = category
  if (q) {
    const regex = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    query.$or = [{ name: regex }, { description: regex }, { state: regex }]
  }

  try {
    const docs = await placesCollection()
      .find(query)
      .sort({ totalLikes: -1 })
      .limit(limit)
      .toArray()
    if (docs.length > 0) return docs.map(stripPlaceFields)
  } catch {
    // fall through
  }

  let places = loadPlacesFromFile()
  if (state && state !== 'ALL STATES') {
    places = places.filter((p) => p.state === state)
  }
  if (category && category !== 'ALL') {
    places = places.filter((p) => p.categories?.includes(category))
  }
  if (q) {
    const lower = q.toLowerCase()
    places = places.filter(
      (p) =>
        p.name?.toLowerCase().includes(lower) ||
        p.description?.toLowerCase().includes(lower) ||
        p.state?.toLowerCase().includes(lower),
    )
  }
  places.sort((a, b) => (b.totalLikes || 0) - (a.totalLikes || 0))
  return places.slice(0, limit).map(stripPlaceFields)
}

function loadLocationsFromFile() {
  try {
    return JSON.parse(fs.readFileSync(locationsDataPath, 'utf8'))
  } catch {
    return []
  }
}

async function loadAllLocations() {
  try {
    const docs = await locationsCollection()
      .find({ active: { $ne: false } })
      .sort({ sortOrder: 1, name: 1 })
      .toArray()
    if (docs.length > 0) return docs
  } catch {
    // fall through
  }
  return loadLocationsFromFile()
}

async function loadAllPlacesForItinerary() {
  try {
    const docs = await placesCollection().find({}).sort({ totalLikes: -1 }).toArray()
    if (docs.length > 0) return docs.map(stripPlaceFields).filter((p) => !isFestivalPlace(p))
  } catch {
    // fall through
  }
  return loadPlacesFromFile().map(stripPlaceFields).filter((p) => !isFestivalPlace(p))
}

async function loadPlaceById(id) {
  try {
    const doc = await placesCollection().findOne({ _id: id })
    if (doc) return stripPlaceFields(doc)
  } catch {
    // fall through
  }
  // Heritage sites are resolvable as places too, so they can be saved/viewed.
  try {
    const h = await heritageCollection().findOne({ _id: id })
    if (h) return stripPlaceFields(h)
  } catch {
    // fall through
  }
  const place = loadPlacesFromFile().find((p) => p._id === id)
  if (place) return stripPlaceFields(place)
  const heritage = loadHeritageFromFile().find((p) => p._id === id)
  return heritage ? stripPlaceFields(heritage) : null
}

async function loadPostsByIds(ids, lang) {
  if (!ids?.length) return []
  const locales = loadLocales()
  try {
    const docs = await postsCollection()
      .find({ $or: [{ postId: { $in: ids } }, { id: { $in: ids } }] })
      .toArray()
    const byId = new Map(docs.map((d) => [d.postId || d.id, stripMongoFields(d)]))
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean)
    if (ordered.length > 0) {
      return ordered.map((item) => applyLocale(item, lang, locales))
    }
  } catch {
    // fall through
  }
  const all = loadTrendingFromFile()
  const byId = new Map(all.map((p) => [p.id, p]))
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((item) => applyLocale(item, lang, locales))
}

async function loadTrending(limit) {
  try {
    const docs = await postsCollection()
      .find({})
      .sort({ likesScore: -1 })
      .limit(limit)
      .toArray()
    if (docs.length > 0) return docs.map(stripMongoFields)
  } catch {
    // fall through to JSON file
  }
  return loadTrendingFromFile().slice(0, limit)
}

let postToPlaceMap = null

async function getPostToPlaceMap() {
  if (postToPlaceMap) return postToPlaceMap
  const places = await loadAllPlacesForItinerary()
  postToPlaceMap = new Map()
  for (const place of places) {
    const placeId = place.id || place._id
    const placeName = String(place.name || '').trim()
    if (!placeId || !placeName) continue
    for (const postId of place.postIds || []) {
      if (!postId || postToPlaceMap.has(postId)) continue
      postToPlaceMap.set(postId, {
        placeId,
        placeName,
        state: place.state || null,
        placeDescription: place.description || null,
        coverImage: place.coverImage || null,
        placeCategories: place.categories || null,
        placePostCount: place.postCount ?? (place.postIds?.length || 0),
      })
    }
  }
  return postToPlaceMap
}

function enrichTrendingWithPlace(item, postToPlace) {
  const postId = item.id || item.postId
  const linked = postId ? postToPlace.get(postId) : null
  if (!linked?.placeName) return item
  return {
    ...item,
    placeId: linked.placeId,
    placeName: linked.placeName,
    state: linked.state || item.state,
    placeDescription: linked.placeDescription || item.placeDescription || null,
    placeCoverImage: resolvePublicAssetUrl(linked.coverImage || item.placeCoverImage || null),
    placeCategories: linked.placeCategories || item.placeCategories || null,
    placePostCount: linked.placePostCount ?? item.placePostCount ?? null,
  }
}

// Home "What locals are saying" — MongoDB only (posts + places collections).
async function loadTrendingWithPlacesFromDb(limit, scanLimit) {
  await connectDb()

  const docs = await postsCollection()
    .find({})
    .sort({ likesScore: -1 })
    .limit(scanLimit)
    .toArray()

  if (docs.length === 0) return []

  const postIds = docs.map((doc) => doc.postId || doc.id).filter(Boolean)
  const placeDocs = await placesCollection()
    .find({ postIds: { $in: postIds } })
    .toArray()

  const postToPlace = new Map()
  for (const place of placeDocs) {
    const placeId = place._id
    const placeName = String(place.name || '').trim()
    if (!placeId || !placeName) continue
    for (const pid of place.postIds || []) {
      if (!postToPlace.has(pid)) {
        postToPlace.set(pid, {
          placeId,
          placeName,
          state: place.state || null,
          placeDescription: place.description || null,
          coverImage: place.coverImage || null,
          placeCategories: place.categories || null,
          placePostCount: place.postCount ?? (place.postIds?.length || 0),
        })
      }
    }
  }

  const result = []
  for (const doc of docs) {
    const item = stripMongoFields(doc)
    const enriched = enrichTrendingWithPlace(item, postToPlace)
    if (!String(enriched.placeName || '').trim()) continue
    result.push(enriched)
    if (result.length >= limit) break
  }
  return result
}

app.get('/api/health', async (_req, res) => {
  let mongo = false
  let postCount = 0
  let userCount = 0
  try {
    await connectDb()
    postCount = await postsCollection().countDocuments()
    userCount = await usersCollection().countDocuments()
    mongo = true
  } catch {
    mongo = false
  }
  res.json({
    status: 'ok',
    message: 'Travelah API is running',
    mongo,
    postCount,
    userCount,
  })
})

app.get('/api/stats', async (_req, res) => {
  try {
    await connectDb()

    let postCount = 0
    let platformCount = 0
    try {
      const [count, platforms] = await Promise.all([
        postsCollection().countDocuments(),
        postsCollection().distinct('platform', { platform: { $exists: true, $ne: '' } }),
      ])
      postCount = count
      platformCount = platforms.filter(Boolean).length
    } catch {
      const fallbackPosts = loadTrendingFromFile()
      postCount = fallbackPosts.length
      platformCount = new Set(fallbackPosts.map((p) => p.platform).filter(Boolean)).size
    }

    const locations = await loadAllLocations()
    const stateCount = locations.filter((loc) => loc.type === 'state').length
    const federalTerritoryCount = locations.filter((loc) => loc.type === 'federal_territory').length

    res.json({
      postCount,
      stateCount,
      federalTerritoryCount,
      platformCount,
    })
  } catch (error) {
    console.error('stats error:', error.message)
    res.status(500).json({ error: 'Failed to load stats' })
  }
})

app.get('/api/auth/config', (_req, res) => {
  res.json({
    googleClientId: getGoogleOAuthClientId(),
    googleAuthEnabled: isGoogleAuthConfigured(),
  })
})

app.post('/api/auth/google', async (req, res) => {
  try {
    await connectDb()
    const { credential, mode } = req.body
    const profile = await verifyGoogleIdToken(credential)
    const isRegister = mode === 'register'

    let user
    let isNewUser
    if (isRegister) {
      ;({ user, isNewUser } = await findOrCreateGoogleUser(profile))
    } else {
      try {
        ;({ user, isNewUser } = await signInWithGoogle(profile))
      } catch (error) {
        if (error.code === 'ACCOUNT_NOT_FOUND') {
          return res.status(404).json({
            error: error.message,
            code: 'ACCOUNT_NOT_FOUND',
            googleEmail: profile.email || null,
            googleDisplayName: profile.displayName || null,
          })
        }
        throw error
      }
    }

    if (!user?.id) {
      throw new Error('Could not create user session')
    }
    const token = signToken({ userId: user.id, username: user.username })
    res.json({ user, token, isNewUser })
  } catch (error) {
    if (error.code === 'NOT_CONFIGURED') {
      return res.status(503).json({ error: error.message })
    }
    if (error.code === 'VALIDATION' || error.code === 'INVALID_TOKEN') {
      return res.status(401).json({ error: error.message })
    }
    if (error.code === 11000) {
      return res.status(409).json({ error: 'An account with this email is already linked to another sign-in method.' })
    }
    console.error('[auth/google]', error)
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Google sign-in failed'
        : error.message || 'Google sign-in failed'
    res.status(500).json({ error: message })
  }
})

app.post('/api/auth/register', async (req, res) => {
  try {
    await connectDb()
    const { username, password, email, displayName, avatarUrl, preferences, settings } = req.body
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'username and password are required' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' })
    }
    const normalizedEmail = email?.trim().toLowerCase()
    const atIndex = normalizedEmail?.indexOf('@') ?? -1
    const domainPart = atIndex >= 0 ? normalizedEmail.slice(atIndex + 1) : ''
    if (normalizedEmail && (atIndex <= 0 || !domainPart.includes('.'))) {
      return res.status(400).json({ error: 'Enter a valid email (e.g. name@example.com).' })
    }

    const user = await createUser({
      username,
      password,
      email,
      displayName,
      avatarUrl,
      preferences,
      settings,
    })
    const token = signToken({ userId: user.id, username: user.username })
    res.status(201).json({ user, token })
  } catch (error) {
    if (error.code === 'USERNAME_TAKEN' || error.code === 'EMAIL_TAKEN') {
      return res.status(409).json({ error: error.message })
    }
    if (error.code === 11000) {
      return res.status(409).json({ error: 'That email or username is already in use.' })
    }
    console.error(error)
    res.status(500).json({ error: 'Registration failed' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    await connectDb()
    const { username, password } = req.body
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'username and password are required' })
    }

    const user = await authenticateUser(username, password)
    const token = signToken({ userId: user.id, username: user.username })
    res.json({ user, token })
  } catch (error) {
    if (error.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: error.message })
    }
    if (error.code === 'GOOGLE_ACCOUNT') {
      return res.status(401).json({ error: error.message })
    }
    console.error(error)
    res.status(500).json({ error: 'Login failed' })
  }
})

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    await connectDb()
    const email = req.body?.email?.trim()
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const { token } = await createPasswordResetToken(email)
    const payload = {
      ok: true,
      message:
        'If an account exists with that email, you will receive password reset instructions shortly.',
    }

    if (token) {
      const origin = getClientOrigin(req)
      const resetLink = `${origin}/reset-password/${token}`

      if (isPasswordResetEmailConfigured()) {
        try {
          await sendPasswordResetEmail(email, resetLink)
          payload.message =
            'Check your email for a password reset link. It expires in 1 hour.'
        } catch (err) {
          console.error('[password-reset-email]', err.message || err)
          payload.resetLink = resetLink
          payload.message = 'We could not send email. Continue below to reset your password.'
        }
      } else {
        // No email server — return link so the app can open the reset page directly.
        payload.resetLink = resetLink
        payload.message = 'Continue to reset your password.'
      }
    }

    res.json(payload)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not process password reset request' })
  }
})

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    await connectDb()
    const { token, password } = req.body || {}
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' })
    }

    await resetPasswordWithToken(token, password)
    res.json({ ok: true, message: 'Password updated. You can sign in with your new password.' })
  } catch (error) {
    if (error.code === 'INVALID_TOKEN' || error.code === 'VALIDATION') {
      return res.status(400).json({ error: error.message })
    }
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: error.message })
    }
    console.error(error)
    res.status(500).json({ error: 'Could not reset password' })
  }
})

app.get('/api/profile/me', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const user = await findUserById(req.auth.userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(await toPublicUserWithTrips(user))
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load profile' })
  }
})

app.patch('/api/profile/me', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const { preferences, settings, displayName, avatarUrl, email, currentPassword, newPassword } = req.body
    const user = await updateUserById(req.auth.userId, {
      preferences,
      settings,
      displayName,
      avatarUrl,
      email,
      currentPassword,
      newPassword,
    })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(user)
  } catch (error) {
    if (error.code === 'EMAIL_TAKEN') {
      return res.status(409).json({ error: error.message })
    }
    if (error.code === 'VALIDATION' || error.code === 'INVALID_PASSWORD') {
      return res.status(400).json({ error: error.message })
    }
    console.error(error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

app.delete('/api/profile/me', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const deleted = await deleteUserAccount(req.auth.userId)
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.status(204).send()
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to delete account' })
  }
})

app.post('/api/profile/me/avatar', authMiddleware, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image must be 2 MB or smaller' })
    }
    if (err) {
      return res.status(400).json({ error: err.message })
    }
    next()
  })
}, async (req, res) => {
  try {
    await connectDb()
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' })
    }

    const userId = req.auth.userId
    const avatarUrl = await saveUserAvatar(userId, req.file.buffer, req.file.mimetype)
    const user = await updateUserById(userId, { avatarUrl })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(user)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: error.message || 'Failed to upload avatar' })
  }
})

app.delete('/api/profile/me/avatar', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    await removeUserAvatars(req.auth.userId)
    const user = await updateUserById(req.auth.userId, { avatarUrl: null })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(user)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to remove avatar' })
  }
})

app.get('/api/profile/me/saved-places/:placeId', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const user = await findUserById(req.auth.userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json({ saved: userHasSavedPlace(user, req.params.placeId) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to check saved place' })
  }
})

app.post('/api/profile/me/saved-places/:placeId', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const place = await loadPlaceById(req.params.placeId)
    if (!place) {
      return res.status(404).json({ error: 'Place not found' })
    }
    const user = await savePlaceForUser(req.auth.userId, place)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(user)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to save place' })
  }
})

app.delete('/api/profile/me/saved-places/:placeId', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const user = await unsavePlaceForUser(req.auth.userId, req.params.placeId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(user)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to remove saved place' })
  }
})

app.post('/api/profile/me/saved-itineraries', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const {
      location,
      title,
      description,
      image,
      startDate,
      endDate,
      itinerary,
      destinations,
      vibes,
      pace,
      budget,
      daysPerDestination,
      vibeLabels,
      paceLabel,
      budgetLabel,
    } = req.body || {}
    if (!title?.trim() && !location?.trim()) {
      return res.status(400).json({ error: 'title or location is required' })
    }
    const user = await saveItineraryForUser(req.auth.userId, {
      location: location?.trim() || 'Malaysia',
      title: title?.trim() || 'Untitled trip',
      description: description?.trim() || '',
      image: image || null,
      startDate: startDate || null,
      endDate: endDate || null,
      itinerary: itinerary || null,
      destinations: Array.isArray(destinations) ? destinations : null,
      vibes: Array.isArray(vibes) ? vibes : null,
      pace: pace || null,
      budget: budget || null,
      daysPerDestination: Array.isArray(daysPerDestination) ? daysPerDestination : null,
      vibeLabels: vibeLabels || null,
      paceLabel: paceLabel || null,
      budgetLabel: budgetLabel || null,
    })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.status(201).json(user)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to save itinerary' })
  }
})

app.get('/api/profile/me/saved-itineraries/:tripId', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const trip = await getSavedItineraryForUser(req.auth.userId, req.params.tripId)
    if (!trip) {
      return res.status(404).json({ error: 'Saved trip not found' })
    }
    res.json(trip)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load saved trip' })
  }
})

app.patch('/api/profile/me/saved-itineraries/:tripId', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const { itinerary } = req.body || {}
    if (!itinerary || !Array.isArray(itinerary.days)) {
      return res.status(400).json({ error: 'itinerary with days is required' })
    }
    const user = await updateSavedTripItinerary(req.auth.userId, req.params.tripId, itinerary)
    if (!user) {
      return res.status(404).json({ error: 'Saved trip not found' })
    }
    res.json(user)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to update saved trip' })
  }
})

app.get('/api/trips', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const includeItinerary =
      req.query.includeItinerary === '1' || req.query.includeItinerary === 'true'
    const trips = await listTripsForUser(req.auth.userId, { includeItinerary })
    res.json(trips)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load trips' })
  }
})

app.post('/api/trips', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const {
      location,
      title,
      description,
      image,
      startDate,
      endDate,
      itinerary,
      destinations,
      vibes,
      pace,
      budget,
      daysPerDestination,
      vibeLabels,
      paceLabel,
      budgetLabel,
    } = req.body || {}
    if (!title?.trim() && !location?.trim()) {
      return res.status(400).json({ error: 'title or location is required' })
    }
    const trip = await createTripForUser(req.auth.userId, {
      location: location?.trim() || 'Malaysia',
      title: title?.trim() || 'Untitled trip',
      description: description?.trim() || '',
      image: image || null,
      startDate: startDate || null,
      endDate: endDate || null,
      itinerary: itinerary || null,
      destinations: Array.isArray(destinations) ? destinations : null,
      vibes: Array.isArray(vibes) ? vibes : null,
      pace: pace || null,
      budget: budget || null,
      daysPerDestination: Array.isArray(daysPerDestination) ? daysPerDestination : null,
      vibeLabels: vibeLabels || null,
      paceLabel: paceLabel || null,
      budgetLabel: budgetLabel || null,
    })
    res.status(201).json(trip)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to save trip' })
  }
})

app.get('/api/trips/:tripId', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const trip = await getSavedItineraryForUser(req.auth.userId, req.params.tripId)
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    res.json(trip)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load trip' })
  }
})

app.patch('/api/trips/:tripId', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const body = req.body || {}
    const patch = {}
    const allowed = [
      'startDate',
      'endDate',
      'vibes',
      'pace',
      'budget',
      'vibeLabels',
      'paceLabel',
      'budgetLabel',
      'daysPerDestination',
      'destinations',
      'title',
      'description',
      'location',
      'itinerary',
    ]

    for (const key of allowed) {
      if (body[key] !== undefined) patch[key] = body[key]
    }

    if (patch.itinerary && !Array.isArray(patch.itinerary.days)) {
      return res.status(400).json({ error: 'itinerary must include a days array' })
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    const trip = await updateTripForUser(req.auth.userId, req.params.tripId, patch)
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    res.json(trip)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to update trip' })
  }
})

app.patch('/api/trips/:tripId/packing', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const { packingList } = req.body || {}
    if (!Array.isArray(packingList)) {
      return res.status(400).json({ error: 'packingList must be an array' })
    }
    const trip = await updateTripPackingListForUser(req.auth.userId, req.params.tripId, packingList)
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    res.json(trip)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to update packing list' })
  }
})

app.patch('/api/trips/:tripId/budget', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const { budgetItems } = req.body || {}
    if (!Array.isArray(budgetItems)) {
      return res.status(400).json({ error: 'budgetItems must be an array' })
    }
    const trip = await updateTripBudgetForUser(req.auth.userId, req.params.tripId, budgetItems)
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    res.json(trip)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to update budget' })
  }
})

app.patch('/api/trips/:tripId/budget-currency', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const { currency } = req.body || {}
    if (typeof currency !== 'string') {
      return res.status(400).json({ error: 'currency must be a string' })
    }
    const trip = await updateTripBudgetCurrencyForUser(req.auth.userId, req.params.tripId, currency)
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    res.json(trip)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to update budget currency' })
  }
})

// --- Currency conversion (cached FX rates, base MYR) ---
const FX_SUPPORTED = ['MYR', 'SGD', 'USD', 'THB', 'IDR', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD']
const FX_TTL_MS = 12 * 60 * 60 * 1000 // refresh at most twice a day
// Approximate fallback rates (units of currency per 1 MYR) used if the API is unreachable.
const FX_FALLBACK = {
  MYR: 1,
  SGD: 0.3,
  USD: 0.22,
  THB: 7.6,
  IDR: 3550,
  EUR: 0.2,
  GBP: 0.17,
  JPY: 33,
  CNY: 1.6,
  AUD: 0.34,
}
let fxCache = { rates: null, fetchedAt: 0, source: 'none' }

async function getFxRates() {
  const now = Date.now()
  if (fxCache.rates && now - fxCache.fetchedAt < FX_TTL_MS) return fxCache

  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/MYR')
    if (!resp.ok) throw new Error(`FX API ${resp.status}`)
    const data = await resp.json()
    if (data?.result !== 'success' || !data.rates) throw new Error('FX API bad payload')
    const rates = {}
    for (const code of FX_SUPPORTED) {
      if (Number.isFinite(data.rates[code])) rates[code] = data.rates[code]
    }
    rates.MYR = 1
    fxCache = { rates, fetchedAt: now, source: 'open.er-api.com' }
  } catch (error) {
    console.warn('FX fetch failed, using fallback rates:', error.message)
    // Keep stale cache if we have one; otherwise use static fallback.
    if (!fxCache.rates) fxCache = { rates: { ...FX_FALLBACK }, fetchedAt: now, source: 'fallback' }
  }
  return fxCache
}

app.get('/api/fx', async (_req, res) => {
  try {
    const { rates, fetchedAt, source } = await getFxRates()
    res.json({ base: 'MYR', rates, fetchedAt, source })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load exchange rates' })
  }
})

app.delete('/api/trips/:tripId', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const deleted = await deleteTripForUser(req.auth.userId, req.params.tripId)
    if (!deleted) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to delete trip' })
  }
})

// ── Trip invite routes ──────────────────────────────────────────────────────

// Generate (or return existing) invite code for a trip
app.post('/api/trips/:tripId/invite', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const { tripId } = req.params
    const userId = req.auth.userId

    if (!(await isTripOwnerOrMember(tripId, userId))) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const invite = await getOrCreateInviteCode(tripId, userId)
    const origin = getClientOrigin(req)
    res.json({
      code: invite._id,
      link: `${origin}/join/${invite._id}`,
      expiresAt: invite.expiresAt,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to generate invite' })
  }
})

// Get trip members list
app.get('/api/trips/:tripId/members', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const { tripId } = req.params
    const userId = req.auth.userId

    if (!(await isTripOwnerOrMember(tripId, userId))) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const trip = await getTripBasicInfo(tripId)
    if (!trip) return res.status(404).json({ error: 'Trip not found' })

    // Fetch owner info and deduplicate (owner must never appear twice)
    const ownerDoc = await findUserById(trip.userId)
    const owner = ownerDoc
      ? {
          userId: ownerDoc._id,
          role: 'owner',
          displayName: ownerDoc.displayName || ownerDoc.username,
          avatarUrl: presentAvatarUrl(ownerDoc.avatarUrl),
        }
      : null

    // Strip any member entry that duplicates the owner (legacy data guard)
    const otherMembers = (trip.members || [])
      .filter((m) => m.userId !== trip.userId)
      .map((m) => ({ ...m, avatarUrl: presentAvatarUrl(m.avatarUrl) }))

    res.json({ members: owner ? [owner, ...otherMembers] : otherMembers })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load members' })
  }
})

// Remove a member from a trip (owner only)
app.delete('/api/trips/:tripId/members/:memberId', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const { tripId, memberId } = req.params
    const userId = req.auth.userId

    const ok = await removeTripMember(tripId, memberId, userId)
    if (!ok) return res.status(403).json({ error: 'Only the trip owner can remove members' })

    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to remove member' })
  }
})

// Resolve invite code — public (used by JoinTripPage to show trip preview)
app.get('/api/invite/:code', async (req, res) => {
  try {
    await connectDb()
    const invite = await resolveInviteCode(req.params.code)
    if (!invite) return res.status(404).json({ error: 'Invalid or expired invite link' })

    const trip = await getTripBasicInfo(invite.tripId)
    if (!trip) return res.status(404).json({ error: 'Trip not found' })

    res.json({ ...trip, code: invite._id, expiresAt: invite.expiresAt })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to resolve invite' })
  }
})

// Join a trip via invite code (requires auth)
app.post('/api/invite/:code/join', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const invite = await resolveInviteCode(req.params.code)
    if (!invite) return res.status(404).json({ error: 'Invalid or expired invite link' })

    const userId = req.auth.userId
    const { tripId } = invite

    // Check if user is already owner or member
    const alreadyIn = await isTripOwnerOrMember(tripId, userId)
    if (!alreadyIn) {
      const user = await findUserById(userId)
      await addTripMember(tripId, {
        userId,
        role: 'member',
        displayName: user?.displayName || user?.username || 'Traveler',
        avatarUrl: user?.avatarUrl || null,
      })
      await incrementUseCount(req.params.code)
    }

    const trip = await getTripForUser(userId, tripId)
    res.json({ tripId, trip })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to join trip' })
  }
})

// ── End invite routes ───────────────────────────────────────────────────────

app.get('/api/profile/:username', async (req, res) => {
  try {
    await connectDb()
    const user = await findUserByUsername(req.params.username)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(await toPublicUserWithTrips(user))
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load profile' })
  }
})

app.get('/api/trending', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 3, 100)
    const withPlace = req.query.withPlace === '1' || req.query.withPlace === 'true'
    const lang = req.query.lang || TRENDING_SOURCE_LANG
    const locales = loadLocales()

    if (withPlace) {
      const scanLimit = Math.min(Math.max(limit * 200, 500), 3000)
      const items = await loadTrendingWithPlacesFromDb(limit, scanLimit)
      const result = items.map((item) => applyLocale(item, lang, locales))
      return res.json(result)
    }

    const items = await loadTrending(limit)
    const postToPlace = await getPostToPlaceMap()
    const result = items.map((item) =>
      enrichTrendingWithPlace(applyLocale(item, lang, locales), postToPlace),
    )
    res.json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load trending' })
  }
})

async function findPostById(postId) {
  try {
    const doc = await postsCollection().findOne({ $or: [{ postId }, { id: postId }] })
    if (doc) return stripMongoFields(doc)
  } catch {
    // fall through
  }
  return loadTrendingFromFile().find((p) => p.id === postId) || null
}

app.get('/api/posts/:id/image', async (req, res) => {
  try {
    const postId = req.params.id
    let local = localPostImagePath(postId)

    if (!local) {
      const post = await findPostById(postId)
      if (post?.image || post?.videoUrl) {
        local = await downloadPostImage(postId, post.image, { videoUrl: post.videoUrl })
        if (local && post.imageLocal !== local) {
          try {
            await connectDb()
            await postsCollection().updateOne(
              { $or: [{ postId }, { id: postId }] },
              { $set: { imageLocal: local } },
            )
          } catch {
            // non-fatal
          }
        }
      }

      if (!local && post?.image) {
        const streamed = await streamPostImage(post.image, { videoUrl: post.videoUrl })
        if (streamed) {
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.setHeader('Content-Type', streamed.contentType)
          return res.send(streamed.buffer)
        }
      }
    }

    if (!local) {
      return res.status(404).json({ error: 'Image not available' })
    }

    const filePath = path.resolve(__dirname, '../../client/public', local.replace(/^\//, ''))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Image file missing' })
    }

    res.setHeader('Cache-Control', 'public, max-age=604800')
    res.sendFile(filePath)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load image' })
  }
})

app.get('/api/destinations/validate', async (req, res) => {
  try {
    await connectDb()
    const q = String(req.query.q || '').trim()
    const locations = await loadAllLocations()
    const part = activeDestinationPart(q) || q
    res.json(validateDestinationQuery(part, locations))
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to validate destination' })
  }
})

app.get('/api/destinations/suggest', async (req, res) => {
  try {
    await connectDb()
    const q = String(req.query.q || '').trim()
    const limit = Math.min(parseInt(req.query.limit, 10) || 6, 12)
    const locations = await loadAllLocations()
    const part = activeDestinationPart(q) || q
    res.json({ suggestions: suggestDestinations(part, locations, limit) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load destination suggestions' })
  }
})

app.get('/api/locations', async (req, res) => {
  try {
    await connectDb()
    const locations = await loadAllLocations()
    const type = req.query.type ? String(req.query.type) : undefined
    const state = req.query.state ? String(req.query.state) : undefined
    const parentId = req.query.parentId ? String(req.query.parentId) : undefined
    const featured = req.query.featured === 'true' ? true : undefined
    const recommended = req.query.recommended === 'true' ? true : undefined
    const subType = req.query.subType ? String(req.query.subType) : undefined
    res.json({ locations: listLocations(locations, { type, state, parentId, featured, recommended, subType }) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load locations' })
  }
})

app.post('/api/itinerary/generate', async (req, res) => {
  try {
    await connectDb()
    const { destination, destinations, startDate, endDate, vibes, pace, budget, daysPerDestination, extraNotes, notes } =
      req.body || {}
    const destList = Array.isArray(destinations)
      ? destinations.filter((item) => String(item || '').trim())
      : String(destination || '')
          .split(/[,;]+|\s+then\s+|\s+&\s+|\s+and\s+/i)
          .map((item) => item.trim())
          .filter(Boolean)

    if (destList.length === 0) {
      return res.status(400).json({ error: 'At least one destination is required' })
    }

    const places = await loadAllPlacesForItinerary()
    const locations = await loadAllLocations()
    const invalid = destList
      .map((item) => validateDestinationQuery(item, locations))
      .filter((result) => !result.valid)

    if (invalid.length > 0) {
      const first = invalid[0]
      return res.status(400).json({
        error: first.message,
        invalidDestinations: invalid,
      })
    }

    const rawNotes = String(extraNotes || notes || '').trim()
    let planNotes = null
    let notesSummary = null
    let notesUsedAi = false
    let notesRateLimited = false

    if (rawNotes) {
      const parsedNotes = await parsePlanNotes(rawNotes, {
        destinations: destList,
        vibes: Array.isArray(vibes) ? vibes : [],
        pace: pace || 'balanced',
        budget: budget || 'mid',
      })
      planNotes = parsedNotes.parsed
      notesSummary = parsedNotes.parsed.summary || rawNotes
      notesUsedAi = parsedNotes.usedAi
      notesRateLimited = parsedNotes.rateLimited
    }

    const itinerary = generateItineraryFromPlaces(places, {
      destinations: destList,
      locations,
      startDate: startDate || null,
      endDate: endDate || null,
      vibes: Array.isArray(vibes) ? vibes : [],
      pace: pace || 'balanced',
      budget: budget || 'mid',
      daysPerDestination: Array.isArray(daysPerDestination) ? daysPerDestination : null,
      planNotes,
      userNotes: rawNotes || null,
      notesSummary,
    })

    res.json({ ...itinerary, notesUsedAi, notesRateLimited })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to generate itinerary' })
  }
})

// Convert a plain day count into start/end dates (the itinerary engine derives
// its day count from the date range). Starts from today.
function datesFromDayCount(days) {
  if (!Number.isFinite(days) || days < 1) return { startDate: null, endDate: null }
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + (days - 1))
  const fmt = (d) => d.toISOString().split('T')[0]
  return { startDate: fmt(start), endDate: fmt(end) }
}

// AI Concierge — natural language in, real grounded itinerary out.
// Optional auth: works for guests; persists conversations for signed-in users.
app.post('/api/concierge', optionalAuth, async (req, res) => {
  try {
    const { message, history, conversationId } = req.body || {}
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Message is required' })
    }
    const userId = req.auth?.userId || null

    if (!isConciergeConfigured()) {
      return res.json({
        configured: false,
        reply:
          "The AI concierge isn't switched on yet — add a free GEMINI_API_KEY to enable it. Meanwhile, the step-by-step planner works great.",
        plan: null,
        conversationId: conversationId || null,
      })
    }

    let intent
    try {
      intent = await extractTripIntent(
        String(message),
        Array.isArray(history) ? history.slice(-8) : [],
      )
    } catch (aiError) {
      // Free-tier daily/per-minute quota exhausted — tell the client to show a
      // friendly "limit reached" message rather than a generic error.
      if (aiError.status === 429) {
        return res.json({
          configured: true,
          rateLimited: true,
          reply: "I've reached today's free AI limit. Please try again tomorrow!",
          plan: null,
          conversationId: conversationId || null,
        })
      }
      throw aiError
    }

    let plan = null

    // Only build an itinerary when the user actually wants one — a "suggest top
    // places" question gets a list reply, not an auto-generated trip.
    if (intent.wantsItinerary && intent.readyToPlan && intent.destinations.length > 0) {
      await connectDb()
      const places = await loadAllPlacesForItinerary()
      const locations = await loadAllLocations()

      const usedDestinations = intent.destinations.filter(
        (dest) => validateDestinationQuery(dest, locations).valid,
      )

      if (usedDestinations.length > 0) {
        const { startDate, endDate } = datesFromDayCount(intent.days)
        const itinerary = generateItineraryFromPlaces(places, {
          destinations: usedDestinations,
          locations,
          startDate,
          endDate,
          vibes: intent.vibes,
          pace: intent.pace,
          budget: intent.budget,
          daysPerDestination: null,
        })

        if (itinerary?.days?.length > 0) {
          // Compact preview stored/returned instead of the full itinerary —
          // the full plan is regenerated from params when opened.
          const stops = (itinerary.days[0]?.activities || [])
            .filter((a) => a.name)
            .slice(0, 3)
            .map((a) => ({ name: a.name, icon: a.icon || 'place' }))
          plan = {
            destination: itinerary.destination || usedDestinations.join(' → '),
            dayCount: itinerary.dayCount || itinerary.days.length,
            stops,
            params: {
              destinations: usedDestinations,
              days: intent.days,
              vibes: intent.vibes,
              pace: intent.pace,
              budget: intent.budget,
              notes: intent.notes,
            },
          }
        }
      }
    }

    const reply = intent.reply || 'Tell me a bit more about your trip and I’ll plan it.'

    // Persist for signed-in users: append to the active conversation, or start
    // a new one if there isn't a valid active conversation yet.
    let activeConversationId = conversationId || null
    if (userId) {
      try {
        await connectDb()
        const userMsg = { role: 'user', text: String(message).trim(), at: new Date() }
        const aiMsg = { role: 'ai', text: reply, plan, at: new Date() }
        const appended =
          activeConversationId &&
          (await appendToConversation(activeConversationId, userId, userMsg, aiMsg))
        if (!appended) {
          activeConversationId = await createConversation(userId, userMsg, aiMsg)
        }
      } catch (persistError) {
        console.error('concierge persist failed:', persistError.message)
      }
    }

    res.json({ configured: true, reply, plan, conversationId: activeConversationId })
  } catch (error) {
    console.error('concierge error:', error.message)
    res.status(502).json({
      error: 'The AI concierge had trouble responding. Please try again.',
    })
  }
})

// Conversations — signed-in users only.
app.get('/api/concierge/conversations', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const conversations = await listConversations(req.auth.userId)
    res.json({ conversations })
  } catch (error) {
    console.error('list conversations error:', error.message)
    res.status(500).json({ error: 'Failed to load conversations' })
  }
})

app.get('/api/concierge/conversations/:id', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    const messages = await getConversationMessages(req.params.id, req.auth.userId)
    if (messages === null) return res.status(404).json({ error: 'Conversation not found' })
    res.json({ messages })
  } catch (error) {
    console.error('get conversation error:', error.message)
    res.status(500).json({ error: 'Failed to load conversation' })
  }
})

app.delete('/api/concierge/conversations/:id', authMiddleware, async (req, res) => {
  try {
    await connectDb()
    await deleteConversation(req.params.id, req.auth.userId)
    res.json({ ok: true })
  } catch (error) {
    console.error('delete conversation error:', error.message)
    res.status(500).json({ error: 'Failed to delete conversation' })
  }
})

app.get('/api/heritage', async (_req, res) => {
  try {
    await connectDb()
    res.json(await loadHeritage())
  } catch (error) {
    console.error('heritage error:', error.message)
    res.status(500).json({ error: 'Failed to load heritage sites' })
  }
})

app.get('/api/places', async (req, res) => {
  try {
    await connectDb()
    const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200)
    const state = req.query.state || 'ALL STATES'
    const category = req.query.category || 'ALL'
    const q = String(req.query.q || '').trim()
    const places = (await loadPlaces({ limit, state, category, q })).filter(
      (place) => !isFestivalPlace(place),
    )
    res.json(places)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load places' })
  }
})

app.get('/api/config/google-maps', (req, res) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim()
  if (!apiKey) {
    return res.json({ configured: false })
  }
  res.json({ configured: true, apiKey })
})

app.get('/api/google/places/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 10)

    if (!isGooglePlacesConfigured()) {
      return res.json({ configured: false, results: [] })
    }

    if (q.length < 2) {
      return res.json({ configured: true, results: [] })
    }

    const results = await searchGooglePlaces(q, { limit })
    res.json({ configured: true, results })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to search Google Places' })
  }
})

app.get('/api/google/transport/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 10)
    const kind = req.query.kind === 'train' ? 'train' : 'flight'

    if (!isGooglePlacesConfigured()) {
      return res.json({ configured: false, results: [] })
    }

    if (q.length < 2) {
      return res.json({ configured: true, results: [] })
    }

    const results = await searchGoogleTransportPlaces(q, { limit, kind })
    res.json({ configured: true, results })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to search transport locations' })
  }
})

app.post('/api/map/resolve-stops', async (req, res) => {
  try {
    const { stops, withLegs } = req.body || {}
    if (!Array.isArray(stops)) {
      return res.status(400).json({ error: 'stops array is required' })
    }

    await connectDb()
    const pins = await resolveItineraryStops(stops, { loadPlaceById })

    let legs = []
    if (withLegs && pins.length > 1) {
      const apiKey = isGooglePlacesConfigured() ? process.env.GOOGLE_PLACES_API_KEY.trim() : null
      legs = await computeTravelLegs(pins, { apiKey })
    }

    res.json({ pins, legs })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to resolve map stops' })
  }
})

app.get('/api/google/places/:id/details', async (req, res) => {
  try {
    if (!isGooglePlacesConfigured()) {
      return res.json({ openingHours: [] })
    }
    const details = await getGooglePlaceDetails(req.params.id)
    res.json(details)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load Google place details' })
  }
})

app.get('/api/places/:id', async (req, res) => {
  try {
    await connectDb()
    const place = await loadPlaceById(req.params.id)
    if (!place || isFestivalPlace(place)) {
      return res.status(404).json({ error: 'Place not found' })
    }
    res.json({
      id: place.id,
      name: place.name,
      openingHours: place.openingHours || [],
      formattedAddress: place.formattedAddress || null,
      googleMapsUri: place.googleMapsUri || null,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load place' })
  }
})

app.get('/api/places/:id/posts', async (req, res) => {
  try {
    await connectDb()
    const lang = req.query.lang || TRENDING_SOURCE_LANG
    const place = await loadPlaceById(req.params.id)
    if (!place || isFestivalPlace(place)) {
      return res.status(404).json({ error: 'Place not found' })
    }
    const loaded = await loadPostsByIds(place.postIds, lang)
    const posts = filterLinkedPlacePosts(place, loaded).sort(
      (a, b) => (b.likesScore || 0) - (a.likesScore || 0),
    )
    res.json({
      place: {
        ...place,
        postCount: posts.length,
        linkedPostCount: (place.postIds || []).length,
      },
      posts,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load place posts' })
  }
})

app.post('/api/translate', async (req, res) => {
  try {
    const { text, to, from = 'auto' } = req.body
    if (!text || !to) {
      return res.status(400).json({ error: 'text and to are required' })
    }
    const translatedText = await translateText(text, to, from)
    res.json({ translatedText })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Translation failed' })
  }
})

app.post('/api/translate/batch', async (req, res) => {
  try {
    const { texts, to, from = 'auto' } = req.body || {}
    if (!Array.isArray(texts) || !to) {
      return res.status(400).json({ error: 'texts array and to are required' })
    }
    if (to === from) {
      return res.json({ translations: texts })
    }
    const translations = await translateBatch(texts, to, from)
    saveCacheToDisk()
    res.json({ translations })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Batch translation failed' })
  }
})

app.get('/api/destinations', async (_req, res) => {
  try {
    await connectDb()
    const locations = await loadAllLocations()
    res.json(listLocations(locations, { recommended: true }))
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to load destinations' })
  }
})

async function start() {
  try {
    await connectDb()
    await ensureInviteIndexes()
    await ensurePasswordResetIndexes()
    const count = await postsCollection().countDocuments()
    const userCount = await usersCollection().countDocuments()
    const placeCount = await placesCollection().countDocuments()
    const locationCount = await locationsCollection().countDocuments()
    console.log(`MongoDB connected — ${count} posts, ${placeCount} places, ${locationCount} locations, ${userCount} users`)
    if (count === 0) {
      console.log('No posts in MongoDB. Run: npm run seed:mongodb')
    }
    if (placeCount === 0) {
      console.log('No places in MongoDB. Run: python nlp/extract_places.py && npm run seed:places')
    }
    if (locationCount === 0) {
      console.log('No locations in MongoDB. Run: npm run seed:locations && npm run tag:place-locations')
    }
    if (userCount === 0) {
      console.log('No users in MongoDB. Run: npm run seed:users')
    }
  } catch (err) {
    console.warn(`MongoDB unavailable (${err.message}). Using merged-data.json fallback.`)
  }

  const locales = loadLocales()
  const localeCount = Object.keys(locales).length
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
    if (isGooglePlacesConfigured()) {
      console.log('Google Places API enabled — map geocoding & Google place search active')
    }
    if (localeCount > 0) {
      console.log(`Pre-translated locales loaded (${localeCount} posts)`)
    }
  })
}

start()
