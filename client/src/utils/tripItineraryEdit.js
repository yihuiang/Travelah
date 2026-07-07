function parseDateOnly(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function countTripDays(startDate, endDate) {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate)
  if (!start || !end || end < start) return 0
  const diff = Math.round((end - start) / 86400000)
  return diff + 1
}

export function dayDateLabel(startDate, dayIndex) {
  const start = parseDateOnly(startDate)
  if (!start) return ''
  const d = new Date(start)
  d.setDate(d.getDate() + dayIndex)
  return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function daySidebarDate(startDate, dayIndex) {
  const start = parseDateOnly(startDate)
  if (!start) return ''
  const d = new Date(start)
  d.setDate(d.getDate() + dayIndex)
  return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })
}

function createEmptyDay(dayIndex, startDate, templateDay) {
  const num = dayIndex + 1
  return {
    id: `day${num}`,
    num,
    tabLabel: 'Explore',
    sidebarDate: daySidebarDate(startDate, dayIndex),
    sidebarTitle: `Day ${num}`,
    title: 'Plan this day',
    date: dayDateLabel(startDate, dayIndex),
    destination: templateDay?.destination || '',
    pin: 1,
    mapPins: [],
    activities: [],
    hideStay: true,
  }
}

export function refreshDayDates(day, startDate, dayIndex) {
  const num = dayIndex + 1
  return {
    ...day,
    num,
    id: day.id || `day${num}`,
    sidebarDate: daySidebarDate(startDate, dayIndex),
    date: dayDateLabel(startDate, dayIndex),
  }
}

export function resizeItineraryDays(itinerary, { startDate, endDate }) {
  const newDayCount = countTripDays(startDate, endDate)
  const oldDayCount = itinerary?.days?.length || 0

  if (!newDayCount) {
    return { itinerary, newDayCount: 0, addedDays: 0, removedDays: 0 }
  }

  let days = [...(itinerary?.days || [])]
  const addedDays = Math.max(0, newDayCount - days.length)
  const removedDays = Math.max(0, days.length - newDayCount)

  days = days.slice(0, newDayCount)
  const templateDay = days[days.length - 1]

  for (let i = days.length; i < newDayCount; i += 1) {
    days.push(createEmptyDay(i, startDate, templateDay))
  }

  days = days.map((day, index) => refreshDayDates(day, startDate, index))

  return {
    itinerary: { ...itinerary, days },
    newDayCount,
    addedDays,
    removedDays,
    oldDayCount,
  }
}

export function mergeGeneratedExtraDays(existingItinerary, generatedItinerary, startDate, keepExistingCount) {
  const targetCount = generatedItinerary?.days?.length || 0
  const merged = []

  for (let i = 0; i < targetCount; i += 1) {
    if (i < keepExistingCount && existingItinerary.days[i]) {
      merged.push(refreshDayDates(existingItinerary.days[i], startDate, i))
    } else if (generatedItinerary.days[i]) {
      merged.push(refreshDayDates(generatedItinerary.days[i], startDate, i))
    }
  }

  return {
    ...existingItinerary,
    days: merged,
    stay: generatedItinerary.stay || existingItinerary.stay,
  }
}
