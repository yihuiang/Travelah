/**
 * Persistent Google Places enrichment keyed by place name + state.
 * Survives NLP re-extracts and MongoDB re-seeds (place IDs are not stable).
 *
 * Once a place has a Google rating, opening hours, or place ID, it is saved here
 * and skipped on future enrich runs (unless --force).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  hasOpeningHoursList,
  normalizeGoogleStoreEntry,
  resolveDisplayOpeningHours,
} from './opening-hours.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const GOOGLE_ENRICHMENT_FIELDS = [
  'googlePlaceId',
  'googleRating',
  'googleReviewCount',
  'googleOpeningHours',
  'googleMapsUri',
  'googleDescription',
  'googleEnrichedAt',
  'googleState',
  'googleFormattedAddress',
]

export const ENRICHMENT_STORE_PATH = path.resolve(
  __dirname,
  '../../data/places-google-enrichment.json',
)

const NAME_OVERRIDE_PATH = path.resolve(__dirname, '../../data/places-name-overrides.json')

export function enrichmentKey(place) {
  const name = String(place?.name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  const state = String(place?.state || 'Malaysia').trim()
  return `${name}|${state}`
}

/** True when Google (or stored) enrichment should be kept and not re-fetched. */
export function hasGoogleEnrichment(place) {
  if (!place || typeof place !== 'object') return false
  if (place.googleEnrichedAt) return true
  if (place.googlePlaceId) return true
  if (place.googleRating != null && place.googleRating !== '') return true
  return false
}

function pickGoogleHours(place) {
  if (hasOpeningHoursList(place.googleOpeningHours)) return place.googleOpeningHours
  if (hasOpeningHoursList(place.openingHours) && place.openingHoursSource === 'google') {
    return place.openingHours
  }
  return null
}

export function pickEnrichment(place) {
  if (!hasGoogleEnrichment(place)) return null
  const data = {}
  for (const field of GOOGLE_ENRICHMENT_FIELDS) {
    if (place[field] != null) data[field] = place[field]
  }
  const hours = pickGoogleHours(place)
  if (hours) data.googleOpeningHours = hours
  if (!data.googleEnrichedAt && hasGoogleEnrichment(place)) {
    data.googleEnrichedAt = place.googleEnrichedAt || new Date().toISOString()
  }
  return Object.keys(data).length > 0 ? data : null
}

function hasStoredGoogleEnrichment(data) {
  const normalized = normalizeGoogleStoreEntry(data)
  if (!normalized) return false
  return Boolean(
    normalized.googleEnrichedAt ||
      normalized.googlePlaceId ||
      (normalized.googleRating != null && normalized.googleRating !== ''),
  )
}

function enrichmentScore(data) {
  const normalized = normalizeGoogleStoreEntry(data)
  if (!normalized) return 0
  let score = 0
  if (normalized.googlePlaceId) score += 4
  if (normalized.googleRating != null) score += 2
  if (hasOpeningHoursList(normalized.googleOpeningHours)) score += 2
  if (normalized.googleMapsUri) score += 1
  if (normalized.googleDescription) score += 1
  if (normalized.googleState) score += 1
  return score
}

export function loadNameOverrideAliases() {
  /** canonical name (lower) -> [old names lower] */
  const reverse = new Map()
  if (!fs.existsSync(NAME_OVERRIDE_PATH)) return reverse
  try {
    const data = JSON.parse(fs.readFileSync(NAME_OVERRIDE_PATH, 'utf8'))
    if (!data || typeof data !== 'object') return reverse
    for (const [oldName, newName] of Object.entries(data)) {
      const canonical = String(newName || '').trim().toLowerCase()
      const alias = String(oldName || '').trim().toLowerCase()
      if (!canonical || !alias || canonical === alias) continue
      if (!reverse.has(canonical)) reverse.set(canonical, [])
      reverse.get(canonical).push(alias)
    }
  } catch {
    /* ignore */
  }
  return reverse
}

export function lookupKeysForPlace(place) {
  const keys = [enrichmentKey(place)]
  const name = String(place?.name || '').trim().toLowerCase()
  const state = String(place?.state || 'Malaysia').trim()
  const aliases = loadNameOverrideAliases().get(name) || []
  for (const alias of aliases) {
    keys.push(`${alias}|${state}`)
  }
  return keys
}

export function loadEnrichmentStore() {
  if (!fs.existsSync(ENRICHMENT_STORE_PATH)) return {}
  try {
    const raw = JSON.parse(fs.readFileSync(ENRICHMENT_STORE_PATH, 'utf8'))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

export function saveEnrichmentStore(store) {
  const dir = path.dirname(ENRICHMENT_STORE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const sorted = Object.fromEntries(
    Object.entries(store).sort(([a], [b]) => a.localeCompare(b)),
  )
  fs.writeFileSync(ENRICHMENT_STORE_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
}

export function mergePlaceIntoStore(store, place) {
  const data = pickEnrichment(place)
  if (!data) return store

  const primaryKey = enrichmentKey(place)
  const existing = store[primaryKey]
  if (existing && enrichmentScore(existing) > enrichmentScore(data)) {
    return store
  }
  store[primaryKey] = normalizeGoogleStoreEntry({ ...existing, ...data })

  const aliases = loadNameOverrideAliases().get(String(place.name || '').trim().toLowerCase()) || []
  const state = String(place?.state || 'Malaysia').trim()
  for (const alias of aliases) {
    store[`${alias}|${state}`] = { ...store[primaryKey] }
  }

  return store
}

export function mergePlacesIntoStore(store, places) {
  for (const place of places) mergePlaceIntoStore(store, place)
  return store
}

export function lookupEnrichment(store, place) {
  for (const key of lookupKeysForPlace(place)) {
    const raw = store[key]
    const data = normalizeGoogleStoreEntry(raw)
    if (data && hasStoredGoogleEnrichment(data)) return data
  }
  return null
}

export function applyEnrichmentToPlace(place, store) {
  const data = lookupEnrichment(store, place)
  if (!data) return resolveDisplayOpeningHours(place)
  const merged = { ...place, ...data }
  return resolveDisplayOpeningHours(merged)
}

export function applyEnrichmentToPlaces(places, store) {
  return places.map((place) => applyEnrichmentToPlace(place, store))
}

export function placeNeedsGoogleEnrichment(place, store) {
  if (hasGoogleEnrichment(place)) return false
  if (lookupEnrichment(store, place)) return false
  return true
}
