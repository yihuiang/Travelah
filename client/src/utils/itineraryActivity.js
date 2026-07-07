import { rebuildDayActivities, splitDayActivities } from './reorderItineraryDay.js'

const TIME_SLOTS = ['Morning', 'Late AM', 'Lunch', 'After-noon', 'Evening', 'Night']

const CATEGORY_META = {
  FOOD: { icon: 'restaurant', label: 'Food' },
  CULTURE: { icon: 'museum', label: 'Culture' },
  NATURE: { icon: 'forest', label: 'Nature' },
  'HIDDEN GEMS': { icon: 'diamond', label: 'Hidden gem' },
  ADVENTURE: { icon: 'hiking', label: 'Adventure' },
  STAY: { icon: 'hotel', label: 'Stay' },
}

function shortLabel(text, max = 14) {
  if (!text || text.length <= max) return text || ''
  return `${text.slice(0, max - 1)}…`
}

function formatLikes(place) {
  if (place.likesLabel) {
    const match = place.likesLabel.match(/[\d.]+[Kk万]?/)
    return match ? match[0] : null
  }
  if (place.totalLikes >= 1000) return `${(place.totalLikes / 1000).toFixed(1)}K`
  if (place.totalLikes > 0) return String(place.totalLikes)
  return null
}

export function formatDisplayTime(time24) {
  if (!time24) return ''
  const [hRaw, mRaw] = time24.split(':')
  const h = Number(hRaw)
  const m = Number(mRaw)
  if (Number.isNaN(h)) return time24
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(Number.isNaN(m) ? 0 : m).padStart(2, '0')} ${period}`
}

const DURATION_PRESETS = [30, 60, 90, 120, 180]

export function defaultVisitDuration(place) {
  const cat = place?.categories?.[0] || place?.categoryLabel?.toUpperCase?.() || ''
  if (cat.includes('FOOD') || cat === 'Food') return 60
  if (cat.includes('NATURE') || cat === 'Nature') return 120
  if (cat.includes('CULTURE') || cat === 'Culture') return 90
  return 60
}

export function formatVisitDuration(minutes) {
  const value = Number(minutes)
  if (!value || Number.isNaN(value)) return ''
  if (value < 60) return `${value} min`
  const hours = Math.floor(value / 60)
  const mins = value % 60
  if (mins === 0) return hours === 1 ? '1 hr' : `${hours} hrs`
  return `${hours} hr ${mins} min`
}

export function visitDurationPresets() {
  return DURATION_PRESETS
}

export function updateStopInDay(day, stopId, patch) {
  const { leading, stops } = splitDayActivities(day.activities)
  const newStops = stops.map((stop) => (stop.id === stopId ? { ...stop, ...patch } : stop))
  return {
    ...day,
    activities: rebuildDayActivities(leading, newStops),
  }
}

export function removeStopFromDay(day, stopId) {
  const { leading, stops } = splitDayActivities(day.activities)
  const newStops = stops
    .filter((stop) => stop.id !== stopId)
    .map((item, idx) => ({ ...item, pin: idx + 1 }))
  return {
    ...day,
    activities: rebuildDayActivities(leading, newStops),
    mapPins: rebuildMapPinsForStops(newStops),
  }
}

export function findStopInDay(day, stopId) {
  const { stops } = splitDayActivities(day.activities)
  return stops.find((stop) => stop.id === stopId) || null
}

function placeOpeningHours(place) {
  if (Array.isArray(place?.openingHours) && place.openingHours.length > 0) {
    return place.openingHours
  }
  return null
}

export function mapPinPosition(index, total) {
  const baseX = 140
  const baseY = 170
  const radius = 55
  const angle = (2 * Math.PI * index) / Math.max(total, 1) - Math.PI / 2
  return {
    x: Math.round(baseX + radius * Math.cos(angle)),
    y: Math.round(baseY + radius * Math.sin(angle)),
  }
}

export function getStopMapLabel(stop) {
  if (stop.type === 'flight' || stop.type === 'train') {
    return shortLabel(stop.location || stop.name)
  }
  return shortLabel(stop.name)
}

export function rebuildMapPinsForStops(stops) {
  return stops.map((stop, i) => ({
    ...(stop.lat != null && stop.lng != null
      ? { lat: stop.lat, lng: stop.lng }
      : mapPinPosition(i, stops.length)),
    label: getStopMapLabel(stop),
    kind: stop.type || 'place',
  }))
}

export function buildActivityFromGooglePlace(place, dayNum, slotIndex, pin) {
  const tags = [{ type: 'cat', label: place.categoryLabel || 'Place' }]
  if (place.rating != null) {
    const ratingLabel =
      place.reviewCount != null
        ? `${place.rating.toFixed(1)}★ · ${place.reviewCount.toLocaleString()} Google reviews`
        : `${place.rating.toFixed(1)}★ on Google`
    tags.unshift({ type: 'source', label: ratingLabel })
  } else {
    tags.push({ type: 'tip', label: 'Google Maps' })
  }

  const googlePlaceId = place.googlePlaceId || place.id?.replace(/^google-/, '')

  return {
    id: `d${dayNum}-google-${googlePlaceId}-${slotIndex}`,
    source: 'google',
    time: TIME_SLOTS[slotIndex] || TIME_SLOTS[TIME_SLOTS.length - 1],
    icon: 'location_on',
    pin,
    name: place.name,
    googlePlaceId,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    googleMapsUri:
      place.googleMapsUri ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [place.name, place.formattedAddress].filter(Boolean).join(', '),
      )}`,
    note: place.formattedAddress || null,
    visitDuration: defaultVisitDuration(place),
    startTime: null,
    userNotes: '',
    openingHours: placeOpeningHours(place),
    tags,
  }
}

export function buildActivityFromSelection(place, dayNum, slotIndex, pin) {
  if (place.source === 'google' || place.googlePlaceId) {
    return buildActivityFromGooglePlace(place, dayNum, slotIndex, pin)
  }
  return buildActivityFromPlace(place, dayNum, slotIndex, pin)
}

export function buildActivityFromPlace(place, dayNum, slotIndex, pin) {
  const primaryCat = place.categories?.[0] || 'CULTURE'
  const meta = CATEGORY_META[primaryCat] || CATEGORY_META.CULTURE
  const likes = formatLikes(place)
  const tags = [{ type: 'cat', label: meta.label }]
  if (likes) {
    tags.unshift({ type: 'source', label: `${likes} community likes` })
  }
  if (primaryCat === 'HIDDEN GEMS') {
    tags.push({ type: 'tip', label: 'Local pick' })
  }

  const placeId = place.id || place._id

  return {
    id: `d${dayNum}-add-${placeId}-${slotIndex}`,
    time: TIME_SLOTS[slotIndex] || TIME_SLOTS[TIME_SLOTS.length - 1],
    icon: meta.icon,
    pin,
    name: place.name,
    placeId,
    state: place.state || null,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    likes,
    visitDuration: defaultVisitDuration(place),
    startTime: null,
    userNotes: '',
    openingHours: placeOpeningHours(place),
    tags,
  }
}

export function buildTransportActivity(type, details, dayNum, pin) {
  const {
    number,
    arrivalTime,
    scheduleTime,
    location,
    legType = 'arrival',
    lat = null,
    lng = null,
    formattedAddress = null,
  } = details
  const isFlight = type === 'flight'
  const isArrival = legType !== 'departure'
  const categoryLabel = isFlight ? 'Flight' : 'Train'
  const timeValue = scheduleTime || arrivalTime
  const displayTime = formatDisplayTime(timeValue)
  const normalizedNumber = number.trim().toUpperCase()
  const loc = location.trim()
  const legLabel = isArrival ? 'Arrival' : 'Departure'
  const icon = isFlight ? (isArrival ? 'flight_land' : 'flight_takeoff') : 'train'
  const verb = isArrival ? 'Arrives' : 'Departs'

  return {
    id: `d${dayNum}-${type}-${normalizedNumber.replace(/\s+/g, '')}-${Date.now()}`,
    type,
    legType,
    time: displayTime,
    arrivalTime: timeValue,
    scheduleTime: timeValue,
    icon,
    pin,
    name: `${categoryLabel} ${normalizedNumber}`,
    transportNumber: normalizedNumber,
    location: loc,
    lat,
    lng,
    formattedAddress,
    note: `${legLabel}: ${verb} ${displayTime} at ${loc}`,
    tags: [{ type: 'cat', label: categoryLabel }],
  }
}

export function addStopToDay(day, stop) {
  const { leading, stops } = splitDayActivities(day.activities)
  const newStops = [...stops, stop].map((item, idx) => ({ ...item, pin: idx + 1 }))

  return {
    ...day,
    activities: rebuildDayActivities(leading, newStops),
    mapPins: rebuildMapPinsForStops(newStops),
  }
}

export function addPlaceToDay(day, place, dayNum) {
  const { stops } = splitDayActivities(day.activities)
  const stop = buildActivityFromSelection(place, dayNum, stops.length, stops.length + 1)
  return addStopToDay(day, stop)
}

export function addTransportToDay(day, type, details, dayNum) {
  const { leading, stops } = splitDayActivities(day.activities)
  const isArrival = details.legType !== 'departure'
  const insertIndex = isArrival ? 0 : stops.length
  const stop = buildTransportActivity(type, details, dayNum, insertIndex + 1)

  const newStops = [...stops]
  newStops.splice(insertIndex, 0, stop)
  const pinnedStops = newStops.map((item, idx) => ({ ...item, pin: idx + 1 }))

  return {
    ...day,
    activities: rebuildDayActivities(leading, pinnedStops),
    mapPins: rebuildMapPinsForStops(pinnedStops),
  }
}
