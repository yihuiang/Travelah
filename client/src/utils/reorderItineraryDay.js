export function splitDayActivities(activities = []) {
  const leading = []
  let i = 0
  while (i < activities.length && activities[i].connector) {
    leading.push(activities[i])
    i += 1
  }
  const stops = activities.slice(i).filter((item) => !item.connector)
  return { leading, stops }
}

export function rebuildDayActivities(leading, stops) {
  const activities = [...leading]
  stops.forEach((stop, idx) => {
    if (idx > 0) {
      activities.push({ connector: '15 min travel' })
    }
    activities.push(stop)
  })
  return activities
}

export function reorderStops(stops, fromIndex, toIndex) {
  if (fromIndex === toIndex) return stops
  const next = [...stops]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next.map((stop, idx) => ({ ...stop, pin: idx + 1 }))
}

export function reorderMapPins(mapPins = [], fromIndex, toIndex) {
  if (!mapPins.length || fromIndex === toIndex) return mapPins
  const next = [...mapPins]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function reorderDayStops(day, fromIndex, toIndex) {
  const { leading, stops } = splitDayActivities(day.activities)
  const reordered = reorderStops(stops, fromIndex, toIndex)
  return {
    ...day,
    activities: rebuildDayActivities(leading, reordered),
    mapPins: reorderMapPins(day.mapPins, fromIndex, toIndex),
  }
}
