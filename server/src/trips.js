import { tripsCollection } from './db.js'

function newTripId() {
  return `trip-${Date.now()}`
}

export function toTripSummary(doc) {
  if (!doc) return null
  return {
    id: doc._id,
    userId: doc.userId,
    location: doc.location || 'Malaysia',
    title: doc.title || 'Untitled trip',
    description: doc.description || '',
    image: doc.image || null,
    startDate: doc.startDate || null,
    endDate: doc.endDate || null,
    offset: Boolean(doc.offset),
    destinations: doc.destinations || [],
    vibes: doc.vibes || [],
    pace: doc.pace || 'balanced',
    budget: doc.budget || 'mid',
    daysPerDestination: doc.daysPerDestination || null,
    vibeLabels: doc.vibeLabels || null,
    paceLabel: doc.paceLabel || null,
    budgetLabel: doc.budgetLabel || null,
    extraNotes: doc.extraNotes || null,
    packingList: Array.isArray(doc.packingList) ? doc.packingList : [],
    budgetItems: Array.isArray(doc.budgetItems) ? doc.budgetItems : [],
    budgetCurrency: doc.budgetCurrency || null,
    dayCount: doc.itinerary?.days?.length || 0,
    hasItinerary: Boolean(doc.itinerary?.days?.length),
    members: doc.members || [],
    savedAt: doc.createdAt || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  }
}

export function toPublicTrip(doc) {
  if (!doc) return null
  return {
    ...toTripSummary(doc),
    itinerary: doc.itinerary || null,
  }
}

function buildTripDoc(userId, payload, existingId = null) {
  const now = new Date()
  return {
    _id: existingId || payload.id || newTripId(),
    userId,
    location: payload.location?.trim() || 'Malaysia',
    title: payload.title?.trim() || 'Untitled trip',
    description: payload.description?.trim() || '',
    image: payload.image || null,
    startDate: payload.startDate || null,
    endDate: payload.endDate || null,
    offset: Boolean(payload.offset),
    destinations: Array.isArray(payload.destinations) ? payload.destinations : [],
    vibes: Array.isArray(payload.vibes) ? payload.vibes : [],
    pace: payload.pace || 'balanced',
    budget: payload.budget || 'mid',
    daysPerDestination: Array.isArray(payload.daysPerDestination) ? payload.daysPerDestination : null,
    vibeLabels: payload.vibeLabels || null,
    paceLabel: payload.paceLabel || null,
    budgetLabel: payload.budgetLabel || null,
    extraNotes: typeof payload.extraNotes === 'string' ? payload.extraNotes.trim() || null : null,
    packingList: Array.isArray(payload.packingList) ? payload.packingList : [],
    budgetItems: Array.isArray(payload.budgetItems) ? payload.budgetItems : [],
    budgetCurrency: payload.budgetCurrency || null,
    itinerary:
      payload.itinerary && Array.isArray(payload.itinerary.days) && payload.itinerary.days.length > 0
        ? payload.itinerary
        : null,
    createdAt: payload.createdAt || payload.savedAt || now,
    updatedAt: now,
  }
}

export async function listTripsForUser(userId, { includeItinerary = false } = {}) {
  const projection = includeItinerary ? {} : { itinerary: 0 }
  // Include trips owned by the user OR where the user is an invited member
  const docs = await tripsCollection()
    .find({ $or: [{ userId }, { 'members.userId': userId }] })
    .project(projection)
    .sort({ createdAt: -1, updatedAt: -1 })
    .toArray()

  return docs.map((doc) => (includeItinerary ? toPublicTrip(doc) : toTripSummary(doc)))
}

export async function getTripForUser(userId, tripId) {
  // Allow access for owner OR invited members
  const doc = await tripsCollection().findOne({
    _id: tripId,
    $or: [{ userId }, { 'members.userId': userId }],
  })
  if (doc) return toPublicTrip(doc)

  // Legacy index-based ID fallback (owner-only)
  const indexMatch = String(tripId).match(/^trip-(\d+)$/)
  if (!indexMatch) return null

  const trips = await tripsCollection()
    .find({ userId })
    .sort({ createdAt: 1, updatedAt: 1 })
    .toArray()
  const idx = Number.parseInt(indexMatch[1], 10)
  const legacy = trips[idx]
  if (!legacy) return null
  return toPublicTrip(legacy)
}

export async function getTripBasicInfo(tripId) {
  const doc = await tripsCollection().findOne({ _id: tripId }, {
    projection: { _id: 1, title: 1, location: 1, destinations: 1, image: 1, members: 1, userId: 1 },
  })
  if (!doc) return null
  return {
    tripId: doc._id,
    userId: doc.userId,
    title: doc.title || 'Untitled trip',
    location: doc.location || 'Malaysia',
    destinations: doc.destinations || [],
    image: doc.image || null,
    members: doc.members || [],
    memberCount: (doc.members || []).length + 1, // +1 for owner
  }
}

export async function addTripMember(tripId, member) {
  const { userId, role = 'member', displayName, avatarUrl } = member
  const now = new Date()

  // Never store the owner in the members array — owner is identified by trip.userId
  const trip = await tripsCollection().findOne({ _id: tripId }, { projection: { userId: 1 } })
  if (!trip) return
  if (trip.userId === userId) return

  // Upsert: if member already exists, skip
  const existing = await tripsCollection().findOne({ _id: tripId, 'members.userId': userId })
  if (existing) return // already a member

  await tripsCollection().updateOne(
    { _id: tripId },
    {
      $push: {
        members: { userId, role, displayName: displayName || '', avatarUrl: avatarUrl || null, joinedAt: now },
      },
      $set: { updatedAt: now },
    },
  )
}

export async function removeTripMember(tripId, memberUserId, requestingUserId) {
  // Only the trip owner can remove members
  const doc = await tripsCollection().findOne({ _id: tripId, userId: requestingUserId })
  if (!doc) return false

  await tripsCollection().updateOne(
    { _id: tripId },
    {
      $pull: { members: { userId: memberUserId } },
      $set: { updatedAt: new Date() },
    },
  )
  return true
}

export async function isTripOwnerOrMember(tripId, userId) {
  const doc = await tripsCollection().findOne({
    _id: tripId,
    $or: [{ userId }, { 'members.userId': userId }],
  })
  return Boolean(doc)
}

export async function createTripForUser(userId, payload) {
  const doc = buildTripDoc(userId, payload)
  await tripsCollection().insertOne(doc)
  return toPublicTrip(doc)
}

async function resolveTripId(userId, tripId) {
  const accessible = await tripsCollection().findOne({
    _id: tripId,
    $or: [{ userId }, { 'members.userId': userId }],
  })
  if (accessible) return tripId

  const indexMatch = String(tripId).match(/^trip-(\d+)$/)
  if (!indexMatch) return tripId

  const trips = await tripsCollection()
    .find({ userId })
    .sort({ createdAt: 1, updatedAt: 1 })
    .toArray()
  const idx = Number.parseInt(indexMatch[1], 10)
  if (trips[idx]) return trips[idx]._id
  return tripId
}

const TRIP_PATCH_FIELDS = [
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

export async function updateTripForUser(userId, tripId, patch = {}) {
  const resolvedId = await resolveTripId(userId, tripId)
  const allowed = await isTripOwnerOrMember(resolvedId, userId)
  if (!allowed) return null

  const $set = { updatedAt: new Date() }

  for (const key of TRIP_PATCH_FIELDS) {
    if (patch[key] !== undefined) $set[key] = patch[key]
  }

  if (Object.keys($set).length === 1) return null

  const result = await tripsCollection().findOneAndUpdate(
    { _id: resolvedId },
    { $set },
    { returnDocument: 'after' },
  )

  return toPublicTrip(result)
}

export async function updateTripItineraryForUser(userId, tripId, itinerary) {
  return updateTripForUser(userId, tripId, { itinerary })
}

// Packing list can be edited by the owner OR any invited member of the trip.
export async function updateTripPackingListForUser(userId, tripId, packingList) {
  const resolvedId = await resolveTripId(userId, tripId)
  const allowed = await isTripOwnerOrMember(resolvedId, userId)
  if (!allowed) return null

  const cleaned = (Array.isArray(packingList) ? packingList : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      label: String(item.label || '').trim().slice(0, 120),
      checked: Boolean(item.checked),
    }))
    .filter((item) => item.label.length > 0)

  const result = await tripsCollection().findOneAndUpdate(
    { _id: resolvedId },
    { $set: { packingList: cleaned, updatedAt: new Date() } },
    { returnDocument: 'after' },
  )

  return toPublicTrip(result)
}

const BUDGET_CATEGORIES = new Set(['food', 'shopping', 'transport', 'stay', 'activities', 'other'])
const BUDGET_CURRENCIES = new Set(['MYR', 'SGD', 'USD', 'THB', 'IDR', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD'])

// Budget/expenses can be edited by the owner OR any invited member of the trip.
export async function updateTripBudgetForUser(userId, tripId, budgetItems) {
  const resolvedId = await resolveTripId(userId, tripId)
  const allowed = await isTripOwnerOrMember(resolvedId, userId)
  if (!allowed) return null

  const cleaned = (Array.isArray(budgetItems) ? budgetItems : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const amount = Number(item.amount)
      const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0
      const currency = BUDGET_CURRENCIES.has(item.currency) ? item.currency : 'MYR'
      const amountMyr = Number(item.amountMYR)
      return {
        id: String(item.id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        label: String(item.label || '').trim().slice(0, 120),
        amount: safeAmount,
        category: BUDGET_CATEGORIES.has(item.category) ? item.category : 'other',
        currency,
        amountMYR:
          currency === 'MYR'
            ? safeAmount
            : Number.isFinite(amountMyr) && amountMyr >= 0
              ? Math.round(amountMyr * 100) / 100
              : null,
      }
    })
    .filter((item) => item.amount > 0 || item.label.length > 0)

  const result = await tripsCollection().findOneAndUpdate(
    { _id: resolvedId },
    { $set: { budgetItems: cleaned, updatedAt: new Date() } },
    { returnDocument: 'after' },
  )

  return toPublicTrip(result)
}

// The per-trip display currency for the budget total. Owner or member can set it.
export async function updateTripBudgetCurrencyForUser(userId, tripId, currency) {
  const resolvedId = await resolveTripId(userId, tripId)
  const allowed = await isTripOwnerOrMember(resolvedId, userId)
  if (!allowed) return null

  const safeCurrency = BUDGET_CURRENCIES.has(currency) ? currency : 'MYR'

  const result = await tripsCollection().findOneAndUpdate(
    { _id: resolvedId },
    { $set: { budgetCurrency: safeCurrency, updatedAt: new Date() } },
    { returnDocument: 'after' },
  )

  return toPublicTrip(result)
}

// Only the trip owner can delete a trip. Invited members cannot.
export async function deleteTripForUser(userId, tripId) {
  const resolvedId = await resolveTripId(userId, tripId)
  const result = await tripsCollection().deleteOne({ _id: resolvedId, userId })
  return result.deletedCount > 0
}

export async function deleteAllTripsForUser(userId) {
  const result = await tripsCollection().deleteMany({ userId })
  return result.deletedCount
}

export async function migrateEmbeddedTripsForUser(userId, embeddedTrips = []) {
  if (!embeddedTrips.length) return 0

  let migrated = 0
  for (const [index, item] of embeddedTrips.entries()) {
    const tripId = item.id || `trip-${index}`
    const exists = await tripsCollection().findOne({ _id: tripId, userId })
    if (exists) continue

    const doc = buildTripDoc(userId, {
      ...item,
      id: tripId,
      createdAt: item.savedAt || item.createdAt || new Date(),
    })
    await tripsCollection().insertOne(doc)
    migrated += 1
  }
  return migrated
}
