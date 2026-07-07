/**
 * OpenStreetMap opening hours via Overpass API (+ optional Nominatim geocode).
 * https://wiki.openstreetmap.org/wiki/Key:opening_hours
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const PHOTON_BASE = 'https://photon.komoot.io/api/'
const OVERPASS_ENDPOINTS = (
  process.env.OVERPASS_URL
    ? [process.env.OVERPASS_URL]
    : ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter']
)
const USER_AGENT =
  process.env.OSM_USER_AGENT ||
  'TravelahFYP/1.0 (https://github.com/yihuiang/Travelah; set OSM_USER_AGENT in server/.env)'

const DAY_LABELS = {
  Mo: 'Monday',
  Tu: 'Tuesday',
  We: 'Wednesday',
  Th: 'Thursday',
  Fr: 'Friday',
  Sa: 'Saturday',
  Su: 'Sunday',
  PH: 'Public holidays',
}

const STATE_HINTS = {
  Penang: /penang|pulau pinang|george town|槟城/i,
  'Kuala Lumpur': /kuala lumpur|wilayah persekutuan|wp kuala lumpur|吉隆坡/i,
  Selangor: /selangor|雪兰莪/i,
  Sabah: /sabah|沙巴/i,
  Sarawak: /sarawak|砂拉越/i,
  Johor: /johor|柔佛/i,
  Melaka: /melaka|malacca|马六甲/i,
  Perak: /perak|霹雳|ipoh|怡保/i,
  Pahang: /pahang|彭亨/i,
  Kedah: /kedah|吉打/i,
  Terengganu: /terengganu|登嘉楼/i,
  Kelantan: /kelantan|吉兰丹/i,
  'Negeri Sembilan': /negeri sembilan|森美兰/i,
  Perlis: /perlis|玻璃市/i,
  Putrajaya: /putrajaya|布城/i,
}

export function buildPlaceSearchQuery(place) {
  const state = place.state && place.state !== 'Malaysia' ? place.state : ''
  return [place.name, state, 'Malaysia'].filter(Boolean).join(', ')
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function searchTokens(name) {
  return String(name || '')
    .trim()
    .split(/[\s,/|_-]+/)
    .filter((t) => t.length >= 3)
    .slice(0, 3)
}

function nameRegex(name) {
  const tokens = searchTokens(name)
  if (tokens.length === 0) return escapeRegex(String(name || '').slice(0, 24))
  return tokens.map(escapeRegex).join('|')
}

export function parseOsmOpeningHours(raw) {
  if (!raw || typeof raw !== 'string') return []
  const text = raw.trim()
  if (!text) return []
  if (/^24\s*\/\s*7$/i.test(text)) return ['Open 24 hours']

  return text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const dayMatch = part.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?(?:,[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)\s+(.*)$/)
      if (!dayMatch) return part

      const dayPart = dayMatch[1]
      const timePart = dayMatch[2]
      const days = dayPart.split(',').map((chunk) => {
        const range = chunk.match(/^([A-Za-z]{2})(?:-([A-Za-z]{2}))?$/)
        if (!range) return chunk
        const start = DAY_LABELS[range[1]] || range[1]
        const end = range[2] ? DAY_LABELS[range[2]] || range[2] : null
        return end && end !== start ? `${start}–${end}` : start
      })

      return `${days.join(', ')}: ${timePart}`
    })
}

function locationText(tags = {}) {
  return [
    tags['addr:state'],
    tags['addr:city'],
    tags['addr:suburb'],
    tags['addr:place'],
    tags['addr:full'],
    tags['is_in:state'],
    tags['is_in:city'],
  ]
    .filter(Boolean)
    .join(' ')
}

function scoreNameMatch(placeName, candidateName) {
  const a = String(placeName || '')
    .trim()
    .toLowerCase()
  const b = String(candidateName || '')
    .trim()
    .toLowerCase()
  if (!a || !b) return 0
  if (a === b) return 100
  if (b.includes(a) || a.includes(b)) return 80
  const tokensA = new Set(searchTokens(a))
  const tokensB = new Set(searchTokens(b))
  let shared = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) shared += 1
  }
  return shared * 20
}

function scorePlaceMatch(place, element) {
  const tags = element.tags || {}
  const nameScore = scoreNameMatch(place.name, tags.name)
  if (nameScore < 20) return 0

  let stateScore = 0
  const hint = STATE_HINTS[place.state]
  const loc = locationText(tags)
  if (hint && hint.test(loc)) stateScore = 30
  else if (!place.state || place.state === 'Malaysia') stateScore = 10
  else if (place.state && loc.toLowerCase().includes(place.state.toLowerCase())) stateScore = 25

  return nameScore + stateScore
}

async function overpassRequest(query) {
  let lastError = null
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
      })

      if (!res.ok) {
        const err = await res.text()
        lastError = new Error(`Overpass failed (${res.status}): ${err.slice(0, 120)}`)
        continue
      }

      const data = await res.json()
      return data.elements || []
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('Overpass request failed')
}

async function photonSearch(query) {
  const url = new URL(PHOTON_BASE)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '5')
  url.searchParams.set('lang', 'en')

  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`Photon failed (${res.status})`)
  const data = await res.json()
  return data.features || []
}

function photonToCandidate(feature) {
  const props = feature.properties || {}
  const coords = feature.geometry?.coordinates || []
  return {
    type: props.osm_type,
    id: props.osm_id,
    lat: coords[1],
    lon: coords[0],
    tags: {
      name: props.name,
      'addr:state': props.state,
      'addr:city': props.city,
      'addr:suburb': props.district || props.locality,
      'addr:street': props.street,
    },
    _source: 'photon',
  }
}

function normalizeOsmType(type) {
  const t = String(type || '').toLowerCase()
  if (t === 'n' || t === 'node') return 'node'
  if (t === 'w' || t === 'way') return 'way'
  if (t === 'r' || t === 'relation') return 'relation'
  return null
}

async function fetchOsmElementTags(type, id) {
  const osmType = normalizeOsmType(type)
  if (!osmType || !id) return null

  const url = `https://api.openstreetmap.org/api/0.6/${osmType}/${id}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) return null

  const xml = await res.text()
  const tags = {}
  for (const match of xml.matchAll(/<tag k="([^"]+)" v="([^"]*)"/g)) {
    tags[match[1]] = match[2]
  }
  if (!Object.keys(tags).length) return null
  return { type: osmType, id: Number(id), tags }
}

async function overpassFetchByOsmId(type, id) {
  return fetchOsmElementTags(type, id)
}

async function overpassSearchAround(lat, lon) {
  const query = `
[out:json][timeout:20];
(
  node(around:450,${lat},${lon})["opening_hours"];
  way(around:450,${lat},${lon})["opening_hours"];
);
out tags 25;
`
  return overpassRequest(query)
}

async function nominatimSearch(query) {
  const url = new URL(NOMINATIM_BASE)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '3')
  url.searchParams.set('extratags', '1')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'my')

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Referer: 'https://github.com/yihuiang/Travelah',
    },
  })
  if (!res.ok) {
    throw new Error(`Nominatim failed (${res.status})`)
  }
  return res.json()
}

function pickBestElement(place, elements) {
  let best = null
  let bestScore = 0
  for (const element of elements) {
    const score = scorePlaceMatch(place, element)
    if (score > bestScore) {
      bestScore = score
      best = element
    }
  }
  if (!best || bestScore < 35) return null
  return best
}

function extractHoursFromElement(element) {
  const tags = element.tags || {}
  const raw = tags.opening_hours || tags.opening_hours_covid19
  if (!raw) return null

  const type = element.type
  const id = element.id
  const osmId = type && id ? `${type}/${id}` : null

  return {
    osmOpeningHours: raw,
    openingHours: parseOsmOpeningHours(raw),
    osmId,
    osmMatchName: tags.name || null,
    lat: element.lat != null ? Number(element.lat) : element.center?.lat ?? null,
    lon: element.lon != null ? Number(element.lon) : element.center?.lon ?? null,
  }
}

export async function enrichPlaceFromOsm(place) {
  const textQuery = buildPlaceSearchQuery(place)

  const photonResults = await photonSearch(textQuery)
  const candidates = photonResults.map(photonToCandidate)
  let match = pickBestElement(place, candidates)

  if (match?._source === 'photon') {
    try {
      const detailed = await overpassFetchByOsmId(match.type, match.id)
      if (detailed?.tags?.opening_hours) {
        match = detailed
      }
    } catch {
      // fall through to nearby search
    }
  }

  if (!match || !match.tags?.opening_hours) {
    const geo = match || candidates[0]
    const lat = geo?.lat ?? geo?.center?.lat
    const lon = geo?.lon ?? geo?.center?.lon
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      try {
        const nearby = await overpassSearchAround(lat, lon)
        match = pickBestElement(place, nearby) || match
      } catch {
        // nearby Overpass optional if direct OSM tag fetch failed
      }
    }
  }

  if (!match && process.env.OSM_USE_NOMINATIM === '1') {
    try {
      const results = await nominatimSearch(textQuery)
      const geo = results[0]
      if (geo?.extratags?.opening_hours) {
        match = {
          type: geo.osm_type,
          id: geo.osm_id,
          tags: {
            name: geo.name || geo.display_name,
            opening_hours: geo.extratags.opening_hours,
          },
        }
      } else if (geo?.lat && geo?.lon) {
        try {
          const nearby = await overpassSearchAround(Number(geo.lat), Number(geo.lon))
          match = pickBestElement(place, nearby)
        } catch {
          // ignore
        }
      }
    } catch {
      // optional fallback
    }
  }

  if (!match) {
    return { ok: false, reason: 'no_match', textQuery }
  }

  const hours = extractHoursFromElement(match)
  if (!hours?.openingHours?.length) {
    return {
      ok: false,
      reason: 'no_opening_hours',
      textQuery,
      osmMatchName: match.tags?.name || null,
    }
  }

  return {
    ok: true,
    textQuery,
    ...hours,
    osmEnrichedAt: new Date().toISOString(),
  }
}
