export function formatShortDate(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function nightsBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)))
}

export function formatTripDates(item, options = {}) {
  const { t, language = 'en' } = options
  const localeTag = language === 'zh-CN' ? 'zh-CN' : language === 'ms' ? 'ms-MY' : 'en-GB'
  if (item.startDate && item.endDate) {
    const nights = nightsBetween(item.startDate, item.endDate)
    const fmt = (d) =>
      new Date(d).toLocaleDateString(localeTag, { day: 'numeric', month: 'short', year: 'numeric' })
    const nightsLabel = t ? t('nights') : 'nights'
    return `${fmt(item.startDate)} – ${fmt(item.endDate)} · ${nights} ${nightsLabel}`
  }
  return item.location || (t ? t('Malaysia') : 'Malaysia')
}

export function daysUntilLabel(dateStr) {
  if (!dateStr) return 'Planned'
  const diff = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return 'Past trip'
  if (diff === 0) return 'Starts today'
  return `${diff} days away`
}

export function tripBadge(item) {
  const now = new Date()
  if (item.startDate && item.endDate) {
    const start = new Date(item.startDate)
    const end = new Date(item.endDate)
    if (now >= start && now <= end) {
      return { badge: 'live', labelKey: 'Active now' }
    }
    if (now < start) {
      const diff = Math.ceil((start - now) / (1000 * 60 * 60 * 24))
      if (diff === 0) return { badge: 'upcoming', labelKey: 'Starts today' }
      return { badge: 'upcoming', labelKey: 'In {{n}} days', labelParams: { n: diff } }
    }
    return { badge: 'upcoming', labelKey: 'Completed' }
  }
  return { badge: 'upcoming', labelKey: 'Planned' }
}

export function destinationFromLocation(location) {
  return location?.split(',')[0]?.trim() || 'Malaysia'
}

const ROUTE_SEPARATOR = /\s*(?:→|->|—|–|➜|»|>)\s*|\s+\band\b\s+|\s+then\s+|\s*&\s*/i

function isUsableDestination(value) {
  const label = String(value || '').trim()
  return label.length > 0 && label.toLowerCase() !== 'malaysia'
}

/** Split a route label into individual stops (handles arrows and "and"/"then"). */
export function expandDestinationRoute(route) {
  const raw = String(route || '').trim()
  if (!raw) return []

  const parts = raw
    .split(ROUTE_SEPARATOR)
    .map((part) => part.trim())
    .filter(isUsableDestination)

  if (parts.length) return parts
  return isUsableDestination(raw) ? [raw] : []
}

export function destinationsFromLocation(location) {
  const route = destinationFromLocation(location)
  return expandDestinationRoute(route)
}

export function destinationsFromTripTitle(title) {
  const match = String(title || '').match(/\bin\s+(.+)$/i)
  if (!match) return []
  return expandDestinationRoute(match[1])
}

/** Best-effort destination list for generating an itinerary from a saved trip record. */
export function destinationsFromTrip(item) {
  const stored = []
  for (const entry of item?.destinations || []) {
    for (const part of expandDestinationRoute(String(entry))) {
      if (!stored.includes(part)) stored.push(part)
    }
  }
  if (stored.length > 1) return stored

  const fromLocation = destinationsFromLocation(item?.location)
  if (fromLocation.length > 1) return fromLocation

  const fromTitle = destinationsFromTripTitle(item?.title)
  if (fromTitle.length > 1) return fromTitle

  if (stored.length) return stored
  if (fromLocation.length) return fromLocation
  if (fromTitle.length) return fromTitle

  const single = destinationFromLocation(item?.location)
  return isUsableDestination(single) ? [single] : []
}

export function extractState(location) {
  if (!location) return null
  const parts = location.split(',')
  return parts[parts.length - 1]?.trim() || parts[0]?.trim()
}
