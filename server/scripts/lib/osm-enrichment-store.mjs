/**
 * Persistent OSM opening-hours enrichment keyed by place name + state.
 * OSM is the preferred free source for display opening hours.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { hasOpeningHoursList, resolveDisplayOpeningHours } from './opening-hours.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const OSM_ENRICHMENT_FIELDS = [
  'openingHours',
  'osmOpeningHours',
  'osmId',
  'osmMatchName',
  'osmEnrichedAt',
  'openingHoursSource',
]

export const ENRICHMENT_STORE_PATH = path.resolve(
  __dirname,
  '../../data/places-osm-enrichment.json',
)

export function enrichmentKey(place) {
  const name = String(place?.name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  const state = String(place?.state || 'Malaysia').trim()
  return `${name}|${state}`
}

export function pickEnrichment(place) {
  if (!place?.osmEnrichedAt) return null
  const hasHours = hasOpeningHoursList(place.openingHours)
  const hasMatch = Boolean(place.osmMatchName)
  if (!hasHours && !hasMatch) return null

  const data = {}
  for (const field of OSM_ENRICHMENT_FIELDS) {
    if (place[field] != null) data[field] = place[field]
  }
  if (hasHours) data.openingHoursSource = 'osm'
  return data.osmEnrichedAt ? data : null
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
  store[enrichmentKey(place)] = data
  return store
}

export function mergePlacesIntoStore(store, places) {
  for (const place of places) mergePlaceIntoStore(store, place)
  return store
}

/** OSM hours take priority for the display `openingHours` field. */
export function applyEnrichmentToPlace(place, store) {
  const data = store[enrichmentKey(place)]
  if (!data) return resolveDisplayOpeningHours(place)

  const merged = { ...place, ...data }
  if (hasOpeningHoursList(data.openingHours)) {
    merged.openingHours = data.openingHours
    merged.openingHoursSource = 'osm'
  }
  return resolveDisplayOpeningHours(merged)
}

export function applyEnrichmentToPlaces(places, store) {
  return places.map((place) => applyEnrichmentToPlace(place, store))
}
