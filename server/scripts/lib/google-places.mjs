/**
 * Google Places API (New) — text search + place details.
 * https://developers.google.com/maps/documentation/places/web-service
 */

const PLACES_BASE = 'https://places.googleapis.com/v1'

export function buildPlaceSearchQuery(place) {
  const state = place.state && place.state !== 'Malaysia' ? place.state : ''
  return [place.name, state, 'Malaysia'].filter(Boolean).join(', ')
}

export async function searchPlace(apiKey, textQuery) {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery, languageCode: 'en' }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`searchText failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  return data.places?.[0] || null
}

export async function getPlaceDetails(apiKey, placeResourceId) {
  const id = placeResourceId.replace(/^places\//, '')
  const res = await fetch(`${PLACES_BASE}/places/${id}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'id,displayName,rating,userRatingCount,regularOpeningHours,currentOpeningHours,googleMapsUri,editorialSummary,generativeSummary',
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`place details failed (${res.status}): ${err}`)
  }

  return res.json()
}

export function normalizeGoogleDetails(details) {
  const hours =
    details.regularOpeningHours?.weekdayDescriptions ||
    details.currentOpeningHours?.weekdayDescriptions ||
    []

  const googleDescription =
    details.editorialSummary?.text?.trim() ||
    details.generativeSummary?.overview?.text?.trim() ||
    null

  return {
    googlePlaceId: details.id?.replace(/^places\//, '') || details.id,
    googleRating: details.rating ?? null,
    googleReviewCount: details.userRatingCount ?? null,
    openingHours: hours,
    googleMapsUri: details.googleMapsUri || null,
    googleDescription,
    googleEnrichedAt: new Date().toISOString(),
  }
}

export async function enrichPlaceFromGoogle(apiKey, place) {
  const textQuery = buildPlaceSearchQuery(place)
  const match = await searchPlace(apiKey, textQuery)
  if (!match?.id) {
    return { ok: false, reason: 'no_match', textQuery }
  }

  const details = await getPlaceDetails(apiKey, match.id)
  return {
    ok: true,
    textQuery,
    matchedName: match.displayName?.text || match.formattedAddress,
    ...normalizeGoogleDetails(details),
  }
}
