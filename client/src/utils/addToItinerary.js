import { STATE_NAME_LOCALES } from '../i18n/state-names.js'
import { addPlaceToDay } from './itineraryActivity.js'
import { splitDayActivities } from './reorderItineraryDay.js'
import {
  destinationFromLocation,
  destinationsFromTrip,
  extractState,
  tripBadge,
} from './tripDisplay.js'

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function stateAliases(state) {
  const key = normalizeKey(state)
  if (!key) return []
  const aliases = new Set([key])
  for (const [en, locales] of Object.entries(STATE_NAME_LOCALES)) {
    const enKey = normalizeKey(en)
    const msKey = normalizeKey(locales.ms)
    const zhKey = normalizeKey(locales['zh-CN'])
    if ([enKey, msKey, zhKey].includes(key)) {
      aliases.add(enKey)
      aliases.add(msKey)
      aliases.add(zhKey)
    }
  }
  return [...aliases]
}

export function destinationIncludesState(destination, state) {
  const dest = normalizeKey(destination)
  if (!dest || !state) return false
  return stateAliases(state).some((alias) => dest === alias || dest.includes(alias) || alias.includes(dest))
}

export function tripCoversState(trip, state) {
  if (!state) return true
  const destinations = destinationsFromTrip(trip)
  if (destinations.some((dest) => destinationIncludesState(dest, state))) return true
  if (destinationIncludesState(trip?.location, state)) return true
  return destinationIncludesState(extractState(trip?.location), state)
}

export function selectTripForState(trips, state) {
  const matching = (trips || []).filter((trip) => tripCoversState(trip, state))
  if (!matching.length) return null
  const live = matching.find((trip) => tripBadge(trip).badge === 'live')
  return live || matching[0]
}

export function findDayIndexForState(itinerary, state) {
  const days = itinerary?.days || []
  if (!days.length) return -1
  const index = days.findIndex((day) => destinationIncludesState(day.destination, state))
  return index >= 0 ? index : 0
}

export function isPlaceInItinerary(itinerary, placeId) {
  if (!placeId || !itinerary?.days?.length) return false
  for (const day of itinerary.days) {
    const { stops } = splitDayActivities(day.activities || [])
    if (stops.some((stop) => stop.placeId === placeId)) return true
  }
  return false
}

export function getTripDisplayName(trip) {
  const destinations = destinationsFromTrip(trip)
  if (trip?.title?.trim()) return trip.title.trim()
  if (destinations.length > 1) return destinations.join(' → ')
  if (destinations.length === 1) return destinations[0]
  return destinationFromLocation(trip?.location) || 'Untitled trip'
}

export function formatDayPreview(day, t, translateTemplate) {
  if (!day) return '—'
  const parts = []
  if (day.num != null) {
    parts.push(translateTemplate(t, 'Day {{n}}', { n: day.num }))
  }
  if (day.destination) parts.push(day.destination)
  const extra = day.date || day.sidebarTitle || day.title
  if (extra) parts.push(extra)
  return parts.join(' · ')
}

export function buildDayOptions(itinerary, t, translateTemplate) {
  return (itinerary?.days || []).map((day, index) => ({
    index,
    label: formatDayPreview(day, t, translateTemplate),
  }))
}

export function resolveAddTarget(trip, place) {
  const dayIndex = findDayIndexForState(trip.itinerary, place.state)
  const day = trip.itinerary?.days?.[dayIndex] || null
  return { trip, dayIndex, day }
}

export function appendPlaceToTripItinerary(itinerary, place, dayIndex = null) {
  const days = [...(itinerary?.days || [])]
  if (!days.length) return itinerary

  const targetIndex =
    typeof dayIndex === 'number' && dayIndex >= 0 ? dayIndex : findDayIndexForState(itinerary, place.state)
  const targetDay = days[targetIndex]
  if (!targetDay) return itinerary

  days[targetIndex] = addPlaceToDay(targetDay, place, targetDay.num)
  return { ...itinerary, days }
}
