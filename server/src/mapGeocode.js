import { isGooglePlacesConfigured } from './googlePlaces.js'

const PLACES_BASE = 'https://places.googleapis.com/v1'

export const STATE_CENTERS = {
  Perlis: { lat: 6.4449, lng: 100.2048 },
  Kedah: { lat: 6.1184, lng: 100.3685 },
  Penang: { lat: 5.4141, lng: 100.3288 },
  'Pulau Pinang': { lat: 5.4141, lng: 100.3288 },
  Perak: { lat: 4.5921, lng: 101.0901 },
  Selangor: { lat: 3.0738, lng: 101.5183 },
  'Negeri Sembilan': { lat: 2.7258, lng: 102.2451 },
  Melaka: { lat: 2.1896, lng: 102.2501 },
  Johor: { lat: 1.4854, lng: 103.7618 },
  Pahang: { lat: 3.8126, lng: 103.3256 },
  Terengganu: { lat: 5.3117, lng: 103.1324 },
  Kelantan: { lat: 6.1254, lng: 102.2381 },
  Sabah: { lat: 5.9788, lng: 116.0753 },
  Sarawak: { lat: 1.5535, lng: 110.3593 },
  'Kuala Lumpur': { lat: 3.139, lng: 101.6869 },
  Putrajaya: { lat: 2.9264, lng: 101.6964 },
  Labuan: { lat: 5.2831, lng: 115.2308 },
  Malaysia: { lat: 4.2105, lng: 108.9758 },
}

export function spreadAroundCenter(center, index, total) {
  if (total <= 1) return center
  const radius = 0.018 + total * 0.004
  const angle = (2 * Math.PI * index) / total
  return {
    lat: center.lat + radius * Math.cos(angle),
    lng: center.lng + radius * Math.sin(angle),
  }
}

function buildGeocodeQuery(stop) {
  if (stop.type === 'flight' || stop.type === 'train') {
    return stop.location || stop.name
  }
  if (stop.formattedAddress) {
    return `${stop.name}, ${stop.formattedAddress}`
  }
  const parts = [stop.name, stop.state, 'Malaysia'].filter(Boolean)
  return parts.join(', ')
}

async function geocodeWithGoogle(apiKey, query) {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.location',
    },
    body: JSON.stringify({
      textQuery: query.includes('Malaysia') ? query : `${query}, Malaysia`,
      languageCode: 'en',
      maxResultCount: 1,
    }),
  })

  if (!res.ok) return null

  const data = await res.json()
  const location = data.places?.[0]?.location
  if (!location) return null
  return { lat: location.latitude, lng: location.longitude }
}

async function geocodeWithNominatim(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'my',
  })

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'TravelahFYP/1.0 (itinerary-map)' },
  })

  if (!res.ok) return null

  const data = await res.json()
  if (!Array.isArray(data) || !data[0]) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

async function getGooglePlaceCoordinates(apiKey, googlePlaceId) {
  const id = String(googlePlaceId).replace(/^places\//, '')
  const res = await fetch(`${PLACES_BASE}/places/${id}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'location',
    },
  })

  if (!res.ok) return null

  const data = await res.json()
  if (!data.location) return null
  return { lat: data.location.latitude, lng: data.location.longitude }
}

export async function resolveStopCoordinate(stop, index, total, { apiKey, loadPlaceById }) {
  if (stop.lat != null && stop.lng != null) {
    return { lat: stop.lat, lng: stop.lng }
  }

  if (stop.googlePlaceId && apiKey) {
    const coords = await getGooglePlaceCoordinates(apiKey, stop.googlePlaceId)
    if (coords) return coords
  }

  if (stop.placeId && loadPlaceById) {
    const place = await loadPlaceById(stop.placeId)
    if (place?.lat != null && place?.lng != null) {
      return { lat: place.lat, lng: place.lng }
    }
  }

  const query = buildGeocodeQuery(stop)

  if (apiKey) {
    const googleCoords = await geocodeWithGoogle(apiKey, query)
    if (googleCoords) return googleCoords
  }

  const osmCoords = await geocodeWithNominatim(query)
  if (osmCoords) return osmCoords

  const center =
    STATE_CENTERS[stop.state] ||
    STATE_CENTERS[stop.destination] ||
    STATE_CENTERS.Malaysia

  return spreadAroundCenter(center, index, total)
}

export async function resolveItineraryStops(stops, { loadPlaceById } = {}) {
  const apiKey = isGooglePlacesConfigured() ? process.env.GOOGLE_PLACES_API_KEY.trim() : null
  const total = stops.length

  const resolved = []
  for (let i = 0; i < stops.length; i += 1) {
    const stop = stops[i]
    const coords = await resolveStopCoordinate(stop, i, total, { apiKey, loadPlaceById })
    resolved.push({
      pin: stop.pin ?? i + 1,
      label: stop.name,
      kind: stop.type || 'place',
      lat: coords.lat,
      lng: coords.lng,
    })
  }

  return resolved
}
