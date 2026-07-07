import { filterPlacesByLocation, resolveLocations, resolvePlacePool } from './locations.js'
import { clusterPlacesIntoDays } from './routePlanning.js'

const VIBE_CATEGORIES = {
  culture: ['CULTURE'],
  food: ['FOOD'],
  nature: ['NATURE'],
  adventure: ['NATURE', 'HIDDEN GEMS'],
  relax: ['NATURE'],
  shopping: ['HIDDEN GEMS', 'CULTURE'],
}

const PACE_STOPS = {
  relaxed: 3,
  balanced: 5,
  full: 6,
}

const PACE_LABELS = {
  relaxed: 'Relaxed pace',
  balanced: 'Balanced pace',
  full: 'Full-on pace',
}

const BUDGET_LABELS = {
  shoestring: 'Shoestring',
  mid: 'Mid-range',
  splurge: 'Splurge',
}

const TIME_SLOTS = ['Morning', 'Late AM', 'Lunch', 'After-noon', 'Evening', 'Night']

const CATEGORY_META = {
  FOOD: { icon: 'restaurant', label: 'Food' },
  CULTURE: { icon: 'museum', label: 'Culture' },
  NATURE: { icon: 'forest', label: 'Nature' },
  'HIDDEN GEMS': { icon: 'diamond', label: 'Hidden gem' },
  STAY: { icon: 'hotel', label: 'Stay' },
}

const DAY_TAB_BY_CATEGORY = {
  FOOD: 'Food',
  CULTURE: 'Culture',
  NATURE: 'Nature',
  'HIDDEN GEMS': 'Explore',
  STAY: 'Stay',
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function dedupeDestinationConfigs(configs) {
  const seen = new Set()
  const result = []
  for (const config of configs) {
    const key = normalizeKey(config.label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(config)
  }
  return result.length > 0 ? result : []
}

function resolveItineraryDestinations(input, locations, fallbackLabel = 'Penang') {
  const resolved = resolveLocations(input, locations)
  if (resolved.length > 0) return dedupeDestinationConfigs(resolved)

  const fallback = resolveLocations(fallbackLabel, locations)
  return fallback.length > 0 ? fallback : []
}

function allocateDaysPerSegment(segmentCount, totalDays) {
  if (segmentCount <= 0 || totalDays <= 0) return []
  if (segmentCount > totalDays) return []

  const days = Array(segmentCount).fill(1)
  let remaining = totalDays - segmentCount
  let index = 0
  while (remaining > 0) {
    days[index % segmentCount] += 1
    remaining -= 1
    index += 1
  }
  return days
}

export function resolveDaysPerSegment(segmentCount, totalDays, userDays = null) {
  if (segmentCount <= 0 || totalDays <= 0) return []

  if (Array.isArray(userDays) && userDays.length === segmentCount) {
    const normalized = userDays.map((value) => parseInt(value, 10))
    const valid =
      normalized.every((value) => Number.isFinite(value) && value >= 1) &&
      normalized.reduce((sum, value) => sum + value, 0) === totalDays
    if (valid) return normalized
  }

  return allocateDaysPerSegment(segmentCount, totalDays)
}

function rankPlacesForDestination(places, destinationConfig, preferred, planNotes, locations = []) {
  const pool = resolvePlacePool(destinationConfig, locations)
  const location = pool.poolLocation || destinationConfig.location
  const matched = location
    ? filterPlacesByLocation(places, location)
    : []
  return [...matched]
    .filter((place) => !isStayPlace(place))
    .filter((place) => !shouldExcludePlace(place, planNotes))
    .sort((a, b) => scorePlace(b, preferred, planNotes) - scorePlace(a, preferred, planNotes))
    .filter((place, index, arr) => arr.findIndex((p) => p.id === place.id) === index)
}

function placeSearchText(place) {
  return [place.name, place.description, ...(place.categories || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isStayPlace(place) {
  return (place.categories || []).includes('STAY')
}

function shouldExcludePlace(place, planNotes) {
  if (!planNotes) return false
  const text = placeSearchText(place)
  const prefersHalal = (planNotes.preferKeywords || []).some((kw) =>
    /halal|muslim|jakim/.test(kw),
  )
  if (prefersHalal && /non[- ]?halal|non halal/.test(text)) return true

  for (const kw of planNotes.avoidKeywords || []) {
    if (kw && text.includes(kw.toLowerCase())) return true
  }
  return false
}

function segmentDayTitle({
  globalDayNum,
  totalDays,
  segmentDayIndex,
  segmentDays,
  segmentIndex,
  category,
  destinationLabel,
}) {
  if (globalDayNum === 1) return `Arrive & explore ${destinationLabel}`
  if (globalDayNum === totalDays) return 'Last day & slow exit'
  if (segmentIndex > 0 && segmentDayIndex === 0) return `Travel to ${destinationLabel}`
  const theme = DAY_TAB_BY_CATEGORY[category] || 'Explore'
  return `${theme} in ${destinationLabel}`
}

function segmentTabLabel(globalDayNum, totalDays, segmentDayIndex, segmentIndex, category, destinationLabel) {
  if (globalDayNum === 1) return 'Arrive'
  if (globalDayNum === totalDays) return 'Depart'
  if (segmentIndex > 0 && segmentDayIndex === 0) return shortLabel(destinationLabel, 10)
  return DAY_TAB_BY_CATEGORY[category] || 'Explore'
}

function buildDayFromPlaces({
  dayPlaces,
  dayIndex,
  globalDayNum,
  totalDays,
  segmentDayIndex,
  segmentIndex,
  destinationLabel,
  dates,
  travelConnector,
}) {
  const category = dominantCategory(dayPlaces)
  const title = segmentDayTitle({
    globalDayNum,
    totalDays,
    segmentDayIndex,
    segmentDays: 0,
    segmentIndex,
    category,
    destinationLabel,
  })
  const tabLabel = segmentTabLabel(
    globalDayNum,
    totalDays,
    segmentDayIndex,
    segmentIndex,
    category,
    destinationLabel,
  )
  const mapPins = dayPlaces.map((place, i) => {
    const pos = mapPinPosition(i, dayPlaces.length)
    return { ...pos, label: shortLabel(place.name) }
  })

  const activities = []
  if (travelConnector) {
    activities.push({ connector: travelConnector })
  }
  dayPlaces.forEach((place, i) => {
    if (i > 0) activities.push({ connector: '15 min travel' })
    activities.push(buildActivity(place, globalDayNum, i, i + 1))
  })

  return {
    id: `day${globalDayNum}`,
    num: globalDayNum,
    tabLabel,
    sidebarDate: daySidebarDate(dates?.start, dayIndex),
    sidebarTitle: title,
    title,
    date: dayDateLabel(dates?.start, dayIndex),
    destination: destinationLabel,
    pin: 1,
    mapPins,
    activities,
    hideStay: true,
  }
}

function preferredCategories(vibes = []) {
  const set = new Set()
  for (const vibe of vibes) {
    for (const cat of VIBE_CATEGORIES[vibe] || []) set.add(cat)
  }
  if (set.size === 0) return ['FOOD', 'CULTURE', 'NATURE', 'HIDDEN GEMS']
  return [...set]
}

function scorePlace(place, preferred, planNotes) {
  const cats = place.categories || []
  let score = place.totalLikes || 0
  for (const cat of cats) {
    if (preferred.includes(cat)) score += 5000
  }
  if (cats.includes('HIDDEN GEMS')) score += 500

  if (planNotes) {
    const text = placeSearchText(place)
    for (const kw of planNotes.preferKeywords || []) {
      if (kw && text.includes(kw.toLowerCase())) score += 2500
    }
    for (const kw of planNotes.avoidKeywords || []) {
      if (kw && text.includes(kw.toLowerCase())) score -= 6000
    }
  }

  return score
}

function shortLabel(name, max = 14) {
  const text = String(name || 'Stop').trim()
  if (text.length <= max) return text
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

function mapPinPosition(index, total) {
  const baseX = 140
  const baseY = 170
  const radius = 55
  const angle = (2 * Math.PI * index) / Math.max(total, 1) - Math.PI / 2
  return {
    x: Math.round(baseX + radius * Math.cos(angle)),
    y: Math.round(baseY + radius * Math.sin(angle)),
  }
}

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return null
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null
  const shortFmt = (d) => d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
  const nights = Math.round((end - start) / 86400000)
  return {
    range: `${shortFmt(start)}–${shortFmt(end)} ${start.getFullYear()}`,
    nights,
    dayCount: nights + 1,
    start,
  }
}

function dayDateLabel(start, dayIndex) {
  if (!start) return ''
  const d = new Date(start)
  d.setDate(d.getDate() + dayIndex)
  return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function daySidebarDate(start, dayIndex) {
  if (!start) return ''
  const d = new Date(start)
  d.setDate(d.getDate() + dayIndex)
  return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })
}

function dominantCategory(places) {
  const counts = {}
  for (const place of places) {
    for (const cat of place.categories || ['CULTURE']) {
      counts[cat] = (counts[cat] || 0) + 1
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'CULTURE'
}

function defaultVisitDuration(place) {
  const cat = place?.categories?.[0] || 'CULTURE'
  if (cat === 'FOOD') return 60
  if (cat === 'NATURE') return 120
  if (cat === 'CULTURE') return 90
  return 60
}

function buildActivity(place, dayNum, slotIndex, pin) {
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

  return {
    id: `d${dayNum}-a${slotIndex}`,
    time: TIME_SLOTS[slotIndex] || TIME_SLOTS[TIME_SLOTS.length - 1],
    icon: meta.icon,
    pin,
    name: place.name,
    placeId: place.id,
    state: place.state || null,
    lat: place._routeLat ?? place.lat ?? null,
    lng: place._routeLng ?? place.lng ?? null,
    likes,
    visitDuration: defaultVisitDuration(place),
    startTime: null,
    userNotes: '',
    openingHours:
      Array.isArray(place.openingHours) && place.openingHours.length > 0 ? place.openingHours : null,
    tags,
  }
}


export function generateItineraryFromPlaces(places, options = {}) {
  const {
    destination = 'Penang',
    destinations = null,
    locations = [],
    startDate = null,
    endDate = null,
    vibes = [],
    pace = 'balanced',
    budget = 'mid',
    daysPerDestination = null,
    planNotes = null,
    userNotes = null,
    notesSummary = null,
  } = options

  const destinationConfigs = resolveItineraryDestinations(destinations ?? destination, locations)
  const mergedVibes = [...vibes, ...(planNotes?.bonusVibes || [])]
  const preferred = preferredCategories(mergedVibes)
  const dates = formatDateRange(startDate, endDate)
  const dayCount = dates?.dayCount || 3
  const stopsPerDay = PACE_STOPS[pace] || PACE_STOPS.balanced
  const destinationLabel = destinationConfigs.map((config) => config.label).join(' → ')
  const vibeLabel =
    vibes.length > 0
      ? vibes.map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(', ')
      : 'Mixed'

  const daysPerSegment = resolveDaysPerSegment(
    destinationConfigs.length,
    dayCount,
    daysPerDestination,
  )
  const activeConfigs =
    daysPerSegment.length > 0
      ? destinationConfigs.slice(0, daysPerSegment.length)
      : destinationConfigs.slice(0, dayCount)
  const usedPlaceIds = new Set()
  const days = []
  let dayIndex = 0
  let globalDayNum = 0
  let totalPlaces = 0
  const allRanked = []
  const coverageNotes = []

  for (let segmentIndex = 0; segmentIndex < activeConfigs.length; segmentIndex += 1) {
    const config = activeConfigs[segmentIndex]
    const pool = resolvePlacePool(config, locations)
    const segmentConfig = { ...config, ...pool }
    if (pool.coverageNote) coverageNotes.push(pool.coverageNote)

    const segmentDays = daysPerSegment[segmentIndex] || 0
    if (segmentDays === 0) continue

    const ranked = rankPlacesForDestination(places, segmentConfig, preferred, planNotes, locations).filter(
      (place) => !usedPlaceIds.has(place.id),
    )
    allRanked.push(...ranked)
    totalPlaces += ranked.length

    const needed = segmentDays * stopsPerDay
    const poolList =
      ranked.length > 0 ? ranked : rankPlacesForDestination(places, segmentConfig, preferred, planNotes, locations)
    const selected = []
    for (const place of poolList) {
      if (selected.length >= needed) break
      if (usedPlaceIds.has(place.id)) continue
      selected.push(place)
      usedPlaceIds.add(place.id)
    }
    while (selected.length < needed && poolList.length > 0) {
      selected.push(poolList[selected.length % poolList.length])
    }

    const dayChunks = clusterPlacesIntoDays(selected, segmentDays, stopsPerDay, {
      destinationConfig: segmentConfig,
      locations,
    })

    for (let segmentDayIndex = 0; segmentDayIndex < segmentDays; segmentDayIndex += 1) {
      globalDayNum += 1
      const dayPlaces = dayChunks[segmentDayIndex] || []
      const travelConnector =
        segmentIndex > 0 && segmentDayIndex === 0
          ? `Travel to ${config.label}`
          : null

      days.push(
        buildDayFromPlaces({
          dayPlaces,
          dayIndex,
          globalDayNum,
          totalDays: dayCount,
          segmentDayIndex,
          segmentIndex,
          destinationLabel: config.label,
          dates,
          travelConnector,
        }),
      )
      dayIndex += 1
    }
  }

  if (days.length === 0 || allRanked.length === 0) {
    return {
      destination: destinationLabel,
      destinations: activeConfigs.map((config) => config.label),
      dayCount: 0,
      dateRange: dates?.range || 'Dates TBC',
      nights: dates?.nights || dayCount - 1,
      vibe: vibeLabel,
      pace: PACE_LABELS[pace] || PACE_LABELS.balanced,
      budget: BUDGET_LABELS[budget] || BUDGET_LABELS.mid,
      stay: null,
      days: [],
      empty: true,
      message: `We couldn't find places for "${destinationLabel}" yet. Try Explore or pick another destination.`,
    }
  }

  const topFood = allRanked.find((p) => p.categories?.includes('FOOD'))
  const lastSegment = activeConfigs[activeConfigs.length - 1]

  return {
    destination: destinationLabel,
    destinations: activeConfigs.map((config) => config.label),
    segmentPlan: activeConfigs.map((config, index) => {
      const pool = resolvePlacePool(config, locations)
      return {
        destination: config.label,
        days: daysPerSegment[index] || 0,
        coverage: pool.coverage,
        poolLabel: pool.poolLabel,
        coverageNote: pool.coverageNote,
      }
    }),
    state: lastSegment?.state || allRanked[0]?.state || null,
    dayCount: days.length,
    dateRange: dates?.range || `${days.length} days`,
    nights: dates?.nights ?? days.length - 1,
    vibe: vibeLabel,
    pace: PACE_LABELS[pace] || PACE_LABELS.balanced,
    budget: BUDGET_LABELS[budget] || BUDGET_LABELS.mid,
    userNotes: userNotes || null,
    notesSummary: notesSummary || planNotes?.summary || null,
    coverageNotes: coverageNotes.length > 0 ? [...new Set(coverageNotes)] : null,
    stay: null,
    days,
    empty: false,
    placeCount: totalPlaces,
    coverImage: topFood?.coverImage || allRanked[0]?.coverImage || null,
  }
}
