/**
 * Opening hours policy: OSM (free) first, Google API fallback.
 */

export function hasOpeningHoursList(hours) {
  return Array.isArray(hours) && hours.length > 0
}

/** Skip enrichment when display hours are already stored. */
export function placeHasDisplayOpeningHours(place) {
  return hasOpeningHoursList(place?.openingHours)
}

export function placeNeedsOpeningHoursEnrichment(place, { force = false } = {}) {
  if (force) return true
  return !placeHasDisplayOpeningHours(place)
}

/** Place already has OSM-sourced display hours. */
export function hasOsmDisplayHours(place) {
  if (!place || place.openingHoursSource === 'osm') {
    return hasOpeningHoursList(place?.openingHours)
  }
  return Boolean(
    place?.osmEnrichedAt &&
    hasOpeningHoursList(place.openingHours) &&
    (place.osmOpeningHours || place.osmId),
  )
}

/** Normalize legacy Google store entries that used `openingHours`. */
export function normalizeGoogleStoreEntry(data) {
  if (!data || typeof data !== 'object') return data
  const out = { ...data }
  if (hasOpeningHoursList(out.openingHours) && !hasOpeningHoursList(out.googleOpeningHours)) {
    out.googleOpeningHours = out.openingHours
  }
  delete out.openingHours
  return out
}

/**
 * Set `openingHours` + `openingHoursSource` from OSM / Google fields on a place.
 */
export function resolveDisplayOpeningHours(place) {
  if (!place || typeof place !== 'object') return place

  const osmHours =
    hasOpeningHoursList(place.openingHours) &&
    place.openingHoursSource === 'osm'
      ? place.openingHours
      : place.osmEnrichedAt &&
          hasOpeningHoursList(place.openingHours) &&
          (place.osmOpeningHours || place.osmId)
        ? place.openingHours
        : null

  const googleHours = hasOpeningHoursList(place.googleOpeningHours)
    ? place.googleOpeningHours
    : null

  if (osmHours) {
    place.openingHours = osmHours
    place.openingHoursSource = 'osm'
    return place
  }

  if (googleHours) {
    place.openingHours = googleHours
    place.openingHoursSource = 'google'
    return place
  }

  if (hasOpeningHoursList(place.openingHours) && !place.openingHoursSource) {
    place.openingHoursSource = place.googleEnrichedAt ? 'google' : 'osm'
  }

  return place
}

export function placeNeedsGoogleOpeningHours(place) {
  if (hasOsmDisplayHours(place)) return false
  if (hasOpeningHoursList(place.openingHours) && place.openingHoursSource === 'osm') {
    return false
  }
  if (hasOpeningHoursList(place.googleOpeningHours)) return false
  if (place.osmEnrichedAt && !hasOpeningHoursList(place.openingHours)) {
    return true
  }
  if (!place.osmEnrichedAt && !hasOpeningHoursList(place.openingHours)) {
    return true
  }
  return false
}
