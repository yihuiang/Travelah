const PLACES_BASE = 'https://places.googleapis.com/v1'

const MALAYSIA_BIAS = {
  rectangle: {
    low: { latitude: 0.85, longitude: 99.0 },
    high: { latitude: 7.5, longitude: 119.5 },
  },
}

const TYPE_LABELS = {
  restaurant: 'Food',
  cafe: 'Food',
  bar: 'Food',
  bakery: 'Food',
  meal_takeaway: 'Food',
  tourist_attraction: 'Culture',
  museum: 'Culture',
  art_gallery: 'Culture',
  hindu_temple: 'Culture',
  church: 'Culture',
  mosque: 'Culture',
  park: 'Nature',
  natural_feature: 'Nature',
  lodging: 'Stay',
  hotel: 'Stay',
  shopping_mall: 'Shopping',
  store: 'Shopping',
}

function labelForGoogleType(primaryType) {
  if (!primaryType) return 'Place'
  return TYPE_LABELS[primaryType] || primaryType.replace(/_/g, ' ')
}

function normalizeGoogleSearchResult(place) {
  const id = place.id?.replace(/^places\//, '') || place.id
  const primaryType = place.primaryType || place.types?.[0] || null
  const lat = place.location?.latitude ?? null
  const lng = place.location?.longitude ?? null

  return {
    source: 'google',
    id: `google-${id}`,
    googlePlaceId: id,
    name: place.displayName?.text || 'Unknown place',
    formattedAddress: place.formattedAddress || '',
    primaryType,
    categoryLabel: labelForGoogleType(primaryType),
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    googleMapsUri: place.googleMapsUri || null,
    lat,
    lng,
  }
}

export function isGooglePlacesConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim())
}

export async function searchGoogleTransportPlaces(textQuery, { limit = 8, kind = 'flight' } = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim()
  if (!apiKey) return []

  const q = String(textQuery || '').trim()
  if (q.length < 2) return []

  const includedType = kind === 'train' ? 'train_station' : 'airport'
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.primaryType,places.types,places.rating,places.userRatingCount,places.googleMapsUri,places.location',
    },
    body: JSON.stringify({
      textQuery: q.includes('malaysia') ? q : `${q}, Malaysia`,
      languageCode: 'en',
      maxResultCount: Math.min(Math.max(limit, 1), 10),
      includedType,
      locationBias: MALAYSIA_BIAS,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google transport search failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  return (data.places || []).map(normalizeGoogleSearchResult)
}

export async function getGooglePlaceDetails(googlePlaceId) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim()
  if (!apiKey) return { openingHours: [] }

  const id = String(googlePlaceId || '').replace(/^places\//, '')
  if (!id) return { openingHours: [] }

  const res = await fetch(`${PLACES_BASE}/places/${id}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'regularOpeningHours,currentOpeningHours,googleMapsUri',
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google place details failed (${res.status}): ${err}`)
  }

  const details = await res.json()
  const openingHours =
    details.regularOpeningHours?.weekdayDescriptions ||
    details.currentOpeningHours?.weekdayDescriptions ||
    []

  return {
    openingHours,
    googleMapsUri: details.googleMapsUri || null,
  }
}

export async function searchGooglePlaces(textQuery, { limit = 8 } = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim()
  if (!apiKey) return []

  const q = String(textQuery || '').trim()
  if (q.length < 2) return []

  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.primaryType,places.types,places.rating,places.userRatingCount,places.googleMapsUri,places.location',
    },
    body: JSON.stringify({
      textQuery: q.includes('malaysia') ? q : `${q}, Malaysia`,
      languageCode: 'en',
      maxResultCount: Math.min(Math.max(limit, 1), 10),
      locationBias: MALAYSIA_BIAS,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google Places search failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  return (data.places || []).map(normalizeGoogleSearchResult)
}
