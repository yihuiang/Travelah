import { countTripDays, dayDateLabel, daySidebarDate, refreshDayDates } from './tripItineraryEdit.js'
import { expandDestinationRoute } from './tripDisplay.js'

export function allocateDaysPerSegment(segmentCount, totalDays) {
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

export function destinationRouteKey(destinations) {
  return destinations.join('\u0001')
}

export function segmentDayRanges(daysPerDestination) {
  const ranges = []
  let start = 1
  for (const count of daysPerDestination) {
    ranges.push({ start, end: start + count - 1, count })
    start += count
  }
  return ranges
}

export function resolveInitialSegmentPlan(planMeta, itinerary) {
  let destinations = [...(planMeta?.destinations || [])]
  if (!destinations.length && planMeta?.destination) {
    destinations = expandDestinationRoute(planMeta.destination)
  }
  if (!destinations.length && itinerary?.destination) {
    destinations = expandDestinationRoute(itinerary.destination)
  }
  if (!destinations.length) {
    const fallback = itinerary?.days?.[0]?.destination
    destinations = fallback ? [fallback] : ['Malaysia']
  }

  const tripDayCount =
    countTripDays(planMeta?.startDate, planMeta?.endDate) || itinerary?.days?.length || 1

  const stored = planMeta?.daysPerDestination
  if (Array.isArray(stored) && stored.length === destinations.length) {
    const normalized = stored.map((value) => parseInt(value, 10))
    const valid =
      normalized.every((value) => Number.isFinite(value) && value >= 1) &&
      normalized.reduce((sum, value) => sum + value, 0) === tripDayCount
    if (valid) {
      return { destinations, daysPerDestination: normalized }
    }
  }

  return {
    destinations,
    daysPerDestination: allocateDaysPerSegment(destinations.length, tripDayCount),
  }
}

export function adjustSegmentDay(segmentDays, index, delta, tripDayCount) {
  if (!tripDayCount || segmentDays.length === 0) return segmentDays

  const next = [...segmentDays]
  const proposed = next[index] + delta
  if (proposed < 1) return segmentDays

  const otherSum = next.reduce((sum, value, i) => (i === index ? sum : sum + value), 0)
  if (proposed + otherSum > tripDayCount) {
    let need = proposed + otherSum - tripDayCount
    const donors = next
      .map((value, i) => ({ i, value }))
      .filter((item) => item.i !== index && item.value > 1)
      .sort((a, b) => b.value - a.value)
    for (const donor of donors) {
      if (need <= 0) break
      const take = Math.min(need, next[donor.i] - 1)
      next[donor.i] -= take
      need -= take
    }
    if (need > 0) return segmentDays
  } else if (proposed + otherSum < tripDayCount) {
    let spare = tripDayCount - (proposed + otherSum)
    next[index] = proposed
    for (let i = 0; i < next.length && spare > 0; i += 1) {
      if (i === index) continue
      next[i] += 1
      spare -= 1
    }
    return next
  }

  next[index] = proposed
  return next
}

function splitDaysBySegmentCounts(days, counts) {
  const segments = []
  let cursor = 0
  for (const count of counts) {
    segments.push(days.slice(cursor, cursor + count))
    cursor += count
  }
  if (cursor < days.length && segments.length > 0) {
    segments[segments.length - 1] = [...segments[segments.length - 1], ...days.slice(cursor)]
  }
  return segments
}

function createEmptyDay(dayIndex, startDate, destination, templateDay) {
  const num = dayIndex + 1
  const label = destination?.split(',')[0]?.trim() || destination || 'Explore'
  return {
    id: `day${num}`,
    num,
    tabLabel: label,
    sidebarDate: daySidebarDate(startDate, dayIndex),
    sidebarTitle: label,
    title: `Explore ${label}`,
    date: dayDateLabel(startDate, dayIndex),
    destination: destination || templateDay?.destination || '',
    pin: 1,
    mapPins: [],
    activities: [],
    hideStay: Boolean(templateDay?.hideStay ?? true),
  }
}

export function restructureItineraryBySegments(
  itinerary,
  { oldDestinations, oldDaysPerDestination, destinations, daysPerDestination, startDate },
) {
  const oldDays = itinerary?.days || []
  const oldCounts = oldDaysPerDestination?.length ? oldDaysPerDestination : [oldDays.length]
  const oldSegments = splitDaysBySegmentCounts(oldDays, oldCounts)

  const poolsByDestination = new Map()
  oldDestinations.forEach((dest, index) => {
    poolsByDestination.set(dest, [...(oldSegments[index] || [])])
  })

  const newSegmentDays = []
  for (let i = 0; i < destinations.length; i += 1) {
    const need = daysPerDestination[i]
    const pool = poolsByDestination.get(destinations[i]) || []
    let taken = pool.splice(0, need)
    poolsByDestination.set(destinations[i], pool)

    while (taken.length < need) {
      const globalIdx = newSegmentDays.flat().length + taken.length
      const template = taken[taken.length - 1] || pool[pool.length - 1] || oldDays[oldDays.length - 1]
      taken.push(createEmptyDay(globalIdx, startDate, destinations[i], template))
    }

    taken = taken.map((day) => ({
      ...day,
      destination: destinations[i],
      tabLabel: destinations[i].split(',')[0]?.trim() || destinations[i],
      sidebarTitle: destinations[i].split(',')[0]?.trim() || destinations[i],
    }))
    newSegmentDays.push(taken)
  }

  const days = []
  let dayIndex = 0
  for (const segment of newSegmentDays) {
    for (const day of segment) {
      days.push(refreshDayDates(day, startDate, dayIndex))
      dayIndex += 1
    }
  }

  const routeLabel = destinations.join(' → ')
  return {
    ...itinerary,
    days,
    destination: routeLabel,
    destinations,
    dayCount: days.length,
  }
}

export function buildTripTitle(dayCount, destinations) {
  const route = destinations.join(' → ')
  return `${dayCount} Days in ${route}`
}
