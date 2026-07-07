const MIN_PLACES = 3

/** Map common user-facing names to catalog location names. */
const WELL_KNOWN_ALIASES = {
  genting: 'Genting Highlands',
  'genting highlands': 'Genting Highlands',
  'resorts world genting': 'Genting Highlands',
  kampar: 'Kampar',
  kamp: 'Kampar',
  kl: 'Kuala Lumpur',
  kk: 'Kota Kinabalu',
  'kota kinabalu': 'Kota Kinabalu',
  'kuala lumpur': 'Kuala Lumpur',
  georgetown: 'George Town',
  penang: 'Penang',
  'pulau pinang': 'Penang',
}

export function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export function levenshtein(a, b) {
  const left = normalizeKey(a)
  const right = normalizeKey(b)
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length

  const matrix = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0))
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[left.length][right.length]
}

export function placeMatchesLocation(place, location) {
  if (!place || !location) return false

  const rules = location.matchRules || {}
  const dataState = location.dataState || location.state || ''
  const placeState = place.state || ''
  const placeName = normalizeKey(place.name)

  if (rules.state && !rules.nameContains?.length && !rules.descriptionContains?.length) {
    return placeState === rules.state
  }

  if (rules.requireState && placeState !== rules.requireState) return false
  if (rules.state && placeState !== rules.state) return false

  if (rules.nameContains?.length) {
    const nameHit = rules.nameContains.some((term) => placeName.includes(normalizeKey(term)))
    if (nameHit) return true
  }

  if (rules.descriptionContains?.length) {
    const placeDescription = normalizeKey(place.description)
    return rules.descriptionContains.some((term) => placeDescription.includes(normalizeKey(term)))
  }

  if (rules.nameContains?.length) return false

  if ((location.type === 'state' || location.type === 'federal_territory') && dataState) {
    return placeState === dataState
  }

  return false
}

export function tagPlaceLocationIds(place, locations) {
  const ids = []
  for (const location of locations) {
    if (location.active === false) continue
    if (placeMatchesLocation(place, location)) {
      ids.push(location._id)
    }
  }
  return ids
}

export function filterPlacesByLocation(places, location) {
  if (!location) return []

  const locationId = location._id || location.locationId
  const tagged = places.filter((place) => place.locationIds?.includes(locationId))
  if (tagged.length > 0) return tagged

  return places.filter((place) => placeMatchesLocation(place, location))
}

function catalogEntry(location) {
  const placeCount = location.placeCount || 0
  const minPlaces = locationMinPlaces(location)
  const localCoverage = placeCount >= minPlaces
  return {
    id: location._id,
    label: location.name,
    type: location.type,
    subType: location.subType || null,
    state: location.state || location.name,
    parentId: location.parentId || null,
    placeCount,
    coverage: localCoverage ? 'local' : 'state',
    featured: Boolean(location.featured),
  }
}

export function hasLocalPlaceCoverage(location) {
  if (!location) return false
  return (location.placeCount || 0) >= locationMinPlaces(location)
}

/** Where to pull itinerary places from when a destination has thin local posts. */
export function resolvePlacePool(destinationConfig, locations = []) {
  const loc = destinationConfig?.location
  if (!loc) {
    return {
      poolLocation: null,
      coverage: 'none',
      displayLabel: destinationConfig?.label || '',
      poolLabel: null,
      coverageNote: null,
    }
  }

  const displayLabel = loc.name
  const stateLabel = loc.state || loc.name

  if (hasLocalPlaceCoverage(loc)) {
    return {
      poolLocation: loc,
      coverage: 'local',
      displayLabel,
      poolLabel: displayLabel,
      coverageNote: null,
    }
  }

  if (loc.parentId) {
    const parent = locations.find((item) => item._id === loc.parentId)
    if (parent && (parent.placeCount || 0) > 0) {
      return {
        poolLocation: parent,
        coverage: 'state',
        displayLabel,
        poolLabel: parent.name,
        coverageNote: `Showing popular places in ${parent.name} — we're still building local guides for ${displayLabel}.`,
      }
    }
  }

  if ((loc.placeCount || 0) > 0) {
    return {
      poolLocation: loc,
      coverage: 'local',
      displayLabel,
      poolLabel: displayLabel,
      coverageNote: null,
    }
  }

  return {
    poolLocation: loc,
    coverage: 'state',
    displayLabel,
    poolLabel: stateLabel,
    coverageNote: `Showing popular places in ${stateLabel} — we're still building local guides for ${displayLabel}.`,
  }
}

export function buildLocationCatalog(locations) {
  return locations
    .filter((loc) => loc.active !== false && (loc.placeCount || 0) > 0)
    .map(catalogEntry)
}

function findExactLocation(query, locations) {
  const key = normalizeKey(query)
  if (!key) return null

  const aliasTarget = WELL_KNOWN_ALIASES[key]
  if (aliasTarget) {
    const viaAlias = matchLocationByKey(normalizeKey(aliasTarget), locations)
    if (viaAlias) return viaAlias
  }

  return matchLocationByKey(key, locations)
}

function matchLocationByKey(key, locations) {
  if (!key) return null

  for (const location of locations) {
    if (location.active === false) continue
    if (normalizeKey(location._id) === key || normalizeKey(location.name) === key) {
      return location
    }
    for (const alias of location.aliases || []) {
      if (normalizeKey(alias) === key) return location
    }
  }
  return null
}

function fuzzyLocationMatches(query, locations, limit = 4) {
  const key = normalizeKey(query)
  if (!key) return []

  return locations
    .filter((loc) => loc.active !== false)
    .map((location) => {
      const candidates = [location.name, ...(location.aliases || [])]
      let score = Infinity
      for (const candidate of candidates) {
        const labelKey = normalizeKey(candidate)
        let candidateScore = levenshtein(key, labelKey)
        if (labelKey.startsWith(key) && key.length >= 3) candidateScore -= 2
        score = Math.min(score, candidateScore)
      }
      return { location, score }
    })
    .filter((entry) => entry.score <= 2)
    .sort((a, b) => a.score - b.score || (b.location.placeCount || 0) - (a.location.placeCount || 0))
    .slice(0, limit)
    .map((entry) => entry.location)
}

const GENERIC_WORDS = new Set([
  'butter',
  'food',
  'cafe',
  'coffee',
  'beach',
  'hotel',
  'park',
  'mall',
  'street',
  'town',
  'city',
  'lake',
  'hill',
  'market',
])

function isJunkQuery(raw) {
  const key = normalizeKey(raw)
  if (!key) return true
  if (key.length < 2) return true
  if (/^\d+$/.test(key)) return true
  if (/^[^a-zA-Z\u4e00-\u9fff]+$/.test(key)) return true
  return false
}

function locationMinPlaces(location) {
  return location.minPlaces ?? MIN_PLACES
}

function validationResultFromLocation(location, raw, { corrected = false, code = 'ok' } = {}) {
  const minPlaces = locationMinPlaces(location)
  const placeCount = location.placeCount || 0
  const localCoverage = placeCount >= minPlaces
  const stateLabel = location.state || location.name

  return {
    valid: true,
    code: localCoverage ? code : 'thin',
    coverage: localCoverage ? 'local' : 'state',
    query: raw,
    locationId: location._id,
    label: location.name,
    canonicalLabel: location.name,
    state: stateLabel,
    matchType: location.type,
    placeCount,
    corrected,
    message: localCoverage
      ? corrected
        ? `Did you mean ${location.name}?`
        : `${location.name} — ${placeCount} places available`
      : `${location.name} — we'll plan with popular places in ${stateLabel}`,
    suggestions: [],
  }
}

export function resolveLocation(input, locations) {
  const raw = String(input || '').trim()
  const exact = findExactLocation(raw, locations)
  if (exact) {
    return {
      locationId: exact._id,
      label: exact.name,
      state: exact.state || exact.name,
      type: exact.type,
      location: exact,
    }
  }

  const fuzzy = fuzzyLocationMatches(raw, locations, 1)[0]
  if (fuzzy) {
    return {
      locationId: fuzzy._id,
      label: fuzzy.name,
      state: fuzzy.state || fuzzy.name,
      type: fuzzy.type,
      location: fuzzy,
      corrected: true,
    }
  }

  return {
    locationId: null,
    label: raw,
    state: null,
    type: null,
    location: null,
  }
}

export function resolveLocations(input, locations) {
  const list = Array.isArray(input)
    ? input.map((item) => String(item || '').trim()).filter(Boolean)
    : String(input || '')
        .trim()
        .split(/[,;]+|\s+then\s+|\s+&\s+|\s+and\s+/i)
        .map((part) => part.trim())
        .filter(Boolean)

  if (list.length === 0) {
    const fallback =
      findExactLocation('Penang', locations) ||
      findExactLocation('Pulau Pinang', locations) ||
      locations.find((loc) => loc.recommended)
    return fallback ? [resolveLocation(fallback.name, locations)] : []
  }

  const seen = new Set()
  const result = []
  for (const part of list) {
    const resolved = resolveLocation(part, locations)
    const key = normalizeKey(resolved.label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(resolved)
  }

  if (result.length === 0) {
    const fallback = findExactLocation('Pulau Pinang', locations) || findExactLocation('Penang', locations)
    if (fallback) return [resolveLocation(fallback.name, locations)]
  }

  return result
}

export function activeDestinationPart(input) {
  const parts = String(input || '')
    .split(/[,;]+|\s+then\s+|\s+&\s+|\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
  return parts[parts.length - 1] || ''
}

export function validateDestinationQuery(query, locations = []) {
  const raw = String(query || '').trim()
  const catalog = buildLocationCatalog(locations)

  if (!raw) {
    return {
      valid: false,
      code: 'empty',
      query: raw,
      message: 'Enter a Malaysian state or destination.',
      suggestions: [],
    }
  }

  if (isJunkQuery(raw)) {
    return {
      valid: false,
      code: 'invalid',
      query: raw,
      message: 'That does not look like a valid location.',
      suggestions: fuzzyLocationMatches(raw, locations).map((loc) => loc.name),
    }
  }

  if (GENERIC_WORDS.has(normalizeKey(raw))) {
    return {
      valid: false,
      code: 'invalid',
      query: raw,
      message: `"${raw}" looks like a keyword, not a destination. Try a state or city name.`,
      suggestions: fuzzyLocationMatches(raw, locations).map((loc) => loc.name),
    }
  }

  const exact = findExactLocation(raw, locations)
  if (exact) {
    return validationResultFromLocation(exact, raw, { code: 'ok' })
  }

  const fuzzy = fuzzyLocationMatches(raw, locations)
  const closeMatch = fuzzy[0]
  if (closeMatch) {
    const candidates = [closeMatch.name, ...(closeMatch.aliases || [])]
    let fuzzyScore = Infinity
    for (const candidate of candidates) {
      fuzzyScore = Math.min(fuzzyScore, levenshtein(raw, candidate))
    }
    if (fuzzyScore <= 1) {
      return validationResultFromLocation(closeMatch, raw, { corrected: true, code: 'corrected' })
    }
  }

  return {
    valid: false,
    code: 'not_found',
    query: raw,
    message: closeMatch
      ? `Unknown location. Did you mean ${closeMatch.name}?`
      : 'We could not find this location in Malaysia. Pick from the suggestions or chips.',
    suggestions: fuzzy.map((loc) => loc.name),
  }
}

export function suggestDestinations(query, locations = [], limit = 6) {
  const raw = String(query || '').trim()
  const active = locations.filter((loc) => loc.active !== false)

  if (!raw) {
    return active
      .filter((loc) => (loc.placeCount || 0) > 0)
      .sort((a, b) => {
        if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1
        return (b.placeCount || 0) - (a.placeCount || 0)
      })
      .slice(0, limit)
      .map(catalogEntry)
  }

  const key = normalizeKey(raw)
  return active
    .map((location) => {
      const candidates = [location.name, ...(location.aliases || [])]
      let score = Infinity
      for (const candidate of candidates) {
        const labelKey = normalizeKey(candidate)
        let candidateScore = levenshtein(key, labelKey)
        if (labelKey.startsWith(key) && key.length >= 2) candidateScore -= 2
        score = Math.min(score, candidateScore)
      }
      return { location, score }
    })
    .filter((entry) => entry.score <= 3)
    .sort(
      (a, b) =>
        a.score - b.score ||
        (hasLocalPlaceCoverage(b.location) ? 1 : 0) - (hasLocalPlaceCoverage(a.location) ? 1 : 0) ||
        (b.location.placeCount || 0) - (a.location.placeCount || 0),
    )
    .slice(0, limit)
    .map((entry) => catalogEntry(entry.location))
}

export function listLocations(locations, { type, state, parentId, featured, recommended, subType } = {}) {
  const catalogBrowse = Boolean(parentId || (state && type === 'subdestination'))

  return locations
    .filter((loc) => {
      if (loc.active === false) return false
      if (type && loc.type !== type) return false
      if (subType && loc.subType !== subType) return false
      if (state && loc.state !== state && loc.name !== state && loc.dataState !== state) return false
      if (parentId && loc.parentId !== parentId) return false
      if (recommended === true && !loc.recommended) return false
      if (recommended !== true && featured === true && !loc.featured) return false
      if (recommended !== true && !catalogBrowse && (loc.placeCount || 0) <= 0) return false
      return true
    })
    .sort((a, b) => {
      if (recommended === true) {
        return (a.recommendOrder ?? 99) - (b.recommendOrder ?? 99)
      }
      return (a.sortOrder ?? 99) - (b.sortOrder ?? 99) || a.name.localeCompare(b.name)
    })
    .map((loc) => ({
      id: loc._id,
      name: loc.name,
      type: loc.type,
      state: loc.state,
      dataState: loc.dataState || loc.state,
      parentId: loc.parentId || null,
      placeCount: loc.placeCount || 0,
      featured: Boolean(loc.featured),
      recommended: Boolean(loc.recommended),
      subType: loc.subType || null,
    }))
}
