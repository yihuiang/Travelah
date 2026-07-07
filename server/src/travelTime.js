const ROUTES_BASE = 'https://routes.googleapis.com/directions/v2:computeRoutes'

function toRad(deg) {
  return (deg * Math.PI) / 180
}

function haversineKm(a, b) {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function estimateLeg(a, b) {
  const km = haversineKm(a, b)
  // Road distance is longer than straight-line; apply a winding factor.
  const roadKm = km * 1.35
  // Mixed urban/suburban driving ~32 km/h, plus a short fixed buffer.
  const minutes = Math.max(3, Math.round((roadKm / 32) * 60) + 4)
  return { distanceKm: roadKm, durationMinutes: minutes, mode: 'drive', estimated: true }
}

async function googleDriveLeg(apiKey, a, b) {
  const res = await fetch(ROUTES_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
      destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    }),
  })

  if (!res.ok) return null

  const data = await res.json()
  const route = data.routes?.[0]
  if (!route?.duration) return null

  const seconds = parseInt(String(route.duration).replace('s', ''), 10)
  if (Number.isNaN(seconds)) return null

  return {
    distanceKm: route.distanceMeters != null ? route.distanceMeters / 1000 : null,
    durationMinutes: Math.max(1, Math.round(seconds / 60)),
    mode: 'drive',
    estimated: false,
  }
}

export function formatTravelText(leg) {
  if (!leg || leg.durationMinutes == null) return '15 min travel'
  const mins = leg.durationMinutes
  let timeStr
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    timeStr = m > 0 ? `${h} hr ${m} min` : `${h} hr`
  } else {
    timeStr = `${mins} min`
  }
  if (leg.distanceKm != null) {
    const km = leg.distanceKm
    const kmStr = km < 10 ? km.toFixed(1) : String(Math.round(km))
    return `${timeStr} drive · ${kmStr} km`
  }
  return `${timeStr} drive`
}

export async function computeTravelLegs(pins, { apiKey } = {}) {
  const legs = []
  for (let i = 1; i < pins.length; i += 1) {
    const a = pins[i - 1]
    const b = pins[i]
    let leg = null

    const hasCoords = a?.lat != null && a?.lng != null && b?.lat != null && b?.lng != null

    if (apiKey && hasCoords) {
      try {
        leg = await googleDriveLeg(apiKey, a, b)
      } catch {
        leg = null
      }
    }

    if (!leg && hasCoords) {
      leg = estimateLeg(a, b)
    }

    legs.push({
      fromPin: a.pin,
      toPin: b.pin,
      durationMinutes: leg?.durationMinutes ?? null,
      distanceKm: leg?.distanceKm ?? null,
      estimated: leg?.estimated ?? true,
      text: formatTravelText(leg),
    })
  }
  return legs
}
