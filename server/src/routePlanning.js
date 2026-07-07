import { placeMatchesLocation } from './locations.js'
import { STATE_CENTERS, spreadAroundCenter } from './mapGeocode.js'

/** Known coordinates for tourism sub-areas (location _id or keyword groups). */
const KNOWN_SUBDESTINATION_COORDS = {
  'penang-george-town': { lat: 5.4164, lng: 100.3328 },
  'penang-butterworth': { lat: 5.3991, lng: 100.3638 },
  'penang-bukit-mertajam': { lat: 5.3631, lng: 100.4667 },
  'penang-bayan-lepas': { lat: 5.2945, lng: 100.2593 },
  'penang-nibong-tebal': { lat: 5.1659, lng: 100.4779 },
  'perak-ipoh': { lat: 4.5975, lng: 101.0901 },
  'kedah-alor-setar': { lat: 6.1248, lng: 100.3678 },
  'kedah-langkawi': { lat: 6.35, lng: 99.8 },
  'selangor-petaling-jaya': { lat: 3.1073, lng: 101.6067 },
  'selangor-shah-alam': { lat: 3.0733, lng: 101.5185 },
  'selangor-klang': { lat: 3.0449, lng: 101.4456 },
  'selangor-genting-highlands': { lat: 3.4244, lng: 101.7903 },
  'johor-johor-bahru': { lat: 1.4927, lng: 103.7414 },
  'melaka-melaka-city': { lat: 2.1896, lng: 102.2501 },
  'sabah-kota-kinabalu': { lat: 5.9804, lng: 116.0735 },
  'sabah-kundasang': { lat: 5.978, lng: 116.564 },
  'sarawak-kuching': { lat: 1.5535, lng: 110.3593 },
  'pahang-cameron-highlands': { lat: 4.4721, lng: 101.3801 },
  'pahang-kuantan': { lat: 3.8077, lng: 103.326 },
  'terengganu-kuala-terengganu': { lat: 5.329, lng: 103.137 },
  'kelantan-kota-bharu': { lat: 6.1254, lng: 102.2381 },
  'negeri-sembilan-seremban': { lat: 2.7258, lng: 101.9424 },
}

/** Default tourism hub per state when a place has no finer location signal. */
const STATE_TOURISM_HUB = {
  Penang: { lat: 5.4164, lng: 100.3328 },
  'Pulau Pinang': { lat: 5.4164, lng: 100.3328 },
  Kedah: { lat: 6.1248, lng: 100.3678 },
  Perak: { lat: 4.5975, lng: 101.0901 },
  Melaka: { lat: 2.1896, lng: 102.2501 },
  Johor: { lat: 1.4927, lng: 103.7414 },
  Sabah: { lat: 5.9804, lng: 116.0735 },
  Sarawak: { lat: 1.5535, lng: 110.3593 },
  Selangor: { lat: 3.139, lng: 101.6869 },
  'Kuala Lumpur': { lat: 3.139, lng: 101.6869 },
  Pahang: { lat: 3.8126, lng: 103.3256 },
  Terengganu: { lat: 5.329, lng: 103.137 },
  Kelantan: { lat: 6.1254, lng: 102.2381 },
  'Negeri Sembilan': { lat: 2.7258, lng: 102.2451 },
}

/** Extra area keywords when catalog subdestinations do not cover a place. */
const AREA_KEYWORDS = [
  { keywords: ['batu ferringhi', 'batu feringhi'], coord: { lat: 5.475, lng: 100.248 } },
  { keywords: ['tanjung bungah', 'tanjung tokong'], coord: { lat: 5.461, lng: 100.285 } },
  { keywords: ['air itam', 'kek lok si', 'penang hill', 'bukit bendera'], coord: { lat: 5.4, lng: 100.277 } },
  { keywords: ['balik pulau'], coord: { lat: 5.35, lng: 100.23 } },
  { keywords: ['gurney', 'gurney drive'], coord: { lat: 5.436, lng: 100.307 } },
  {
    keywords: [
      'armenian street',
      'love lane',
      'chulia street',
      'lebuh',
      'george town',
      'georgetown',
      '乔治市',
      '乔治城',
      '乔治镇',
      '槟城老城',
      '老城',
      '七条路',
      'cecil street',
      'campbell street',
      'journal georgetown',
      '槟榔律',
      '多春茶室',
    ],
    coord: { lat: 5.418, lng: 100.336 },
  },
  {
    keywords: ['pinang peranakan', 'peranakan mansion', 'municipal fountain', '消防站', '壁画艺术', 'lebuh armenian'],
    coord: { lat: 5.418, lng: 100.336 },
  },
  { keywords: ['butterworth', '北海', 'penang sentral'], coord: { lat: 5.3991, lng: 100.3638 } },
  { keywords: ['bayan lepas', '峇六拜'], coord: { lat: 5.2945, lng: 100.2593 } },
  { keywords: ['bukit mertajam', '大山脚'], coord: { lat: 5.3631, lng: 100.4667 } },
  { keywords: ['bukit bintang', 'pavilion', 'jalan alor'], coord: { lat: 3.1478, lng: 101.7103 } },
  { keywords: ['chinatown kl', 'petaling street'], coord: { lat: 3.1439, lng: 101.6968 } },
  { keywords: ['batu caves'], coord: { lat: 3.2379, lng: 101.684 } },
  { keywords: ['langkawi', 'pantai cenang'], coord: { lat: 6.35, lng: 99.8 } },
  { keywords: ['cameron highlands', 'brinchang', 'tanah rata'], coord: { lat: 4.4721, lng: 101.3801 } },
  { keywords: ['genting', 'resorts world'], coord: { lat: 3.4244, lng: 101.7903 } },
  { keywords: ['kundasang', 'mount kinabalu', 'kinabalu'], coord: { lat: 5.978, lng: 116.564 } },
]

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function hashString(str) {
  let hash = 0
  const text = String(str || '')
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function jitterCoord(coord, seed) {
  const angle = ((seed % 360) * Math.PI) / 180
  const radius = 0.0025 + (seed % 6) * 0.0008
  return {
    lat: coord.lat + radius * Math.cos(angle),
    lng: coord.lng + radius * Math.sin(angle),
  }
}

function placeCoord(place) {
  return { lat: place._routeLat ?? place.lat, lng: place._routeLng ?? place.lng }
}

export function haversineKm(a, b) {
  const aLat = a._routeLat ?? a.lat
  const aLng = a._routeLng ?? a.lng
  const bLat = b._routeLat ?? b.lat
  const bLng = b._routeLng ?? b.lng
  if (aLat == null || aLng == null || bLat == null || bLng == null) return Infinity

  const toRad = (deg) => (deg * Math.PI) / 180
  const R = 6371
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function centroid(places) {
  if (places.length === 0) return { lat: 0, lng: 0 }
  const sum = places.reduce(
    (acc, place) => {
      const coord = placeCoord(place)
      return { lat: acc.lat + coord.lat, lng: acc.lng + coord.lng }
    },
    { lat: 0, lng: 0 },
  )
  return { lat: sum.lat / places.length, lng: sum.lng / places.length }
}

export function buildLocationCoordinateIndex(locations = []) {
  const index = new Map()

  for (const location of locations) {
    if (KNOWN_SUBDESTINATION_COORDS[location._id]) {
      index.set(location._id, KNOWN_SUBDESTINATION_COORDS[location._id])
    }
  }

  const subdestinations = locations.filter((loc) => loc.type === 'subdestination')
  const byParent = new Map()
  for (const loc of subdestinations) {
    const parentId = loc.parentId || '__root__'
    if (!byParent.has(parentId)) byParent.set(parentId, [])
    byParent.get(parentId).push(loc)
  }

  for (const [parentId, siblings] of byParent) {
    const parent = locations.find((loc) => loc._id === parentId)
    const state = parent?.state || parent?.dataState || siblings[0]?.state
    const center = STATE_CENTERS[state] || STATE_CENTERS.Malaysia

    siblings.forEach((loc, i) => {
      if (!index.has(loc._id)) {
        index.set(loc._id, spreadAroundCenter(center, i, siblings.length))
      }
    })
  }

  return index
}

export function inferPlaceCoordinate(place, destinationConfig, locations = [], locationCoordIndex) {
  if (place?.lat != null && place?.lng != null) {
    return { lat: place.lat, lng: place.lng }
  }

  const index = locationCoordIndex || buildLocationCoordinateIndex(locations)
  const text = normalizeKey(`${place?.name || ''} ${place?.description || ''}`)

  for (const entry of AREA_KEYWORDS) {
    if (entry.keywords.some((keyword) => text.includes(normalizeKey(keyword)))) {
      return jitterCoord(entry.coord, hashString(place?.id || place?._id || place?.name))
    }
  }

  const state = destinationConfig?.state || place?.state || destinationConfig?.location?.state

  if (place?.locationIds?.length) {
    const matched = place.locationIds
      .map((id) => locations.find((loc) => loc._id === id))
      .filter(Boolean)
      .sort((a, b) => {
        const rank = (loc) => (loc.type === 'subdestination' ? 0 : loc.type === 'state' ? 2 : 1)
        return rank(a) - rank(b)
      })

    for (const loc of matched) {
      const coord = index.get(loc._id)
      if (coord) {
        return jitterCoord(coord, hashString(place?.id || place?._id || place?.name))
      }
    }
  }

  const subMatches = locations
    .filter(
      (loc) =>
        loc.type === 'subdestination' &&
        (loc.state === state || loc.dataState === state) &&
        placeMatchesLocation(place, loc),
    )
    .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99))

  for (const loc of subMatches) {
    const coord = index.get(loc._id)
    if (coord) {
      return jitterCoord(coord, hashString(place?.id || place?._id || place?.name))
    }
  }

  const center =
    STATE_TOURISM_HUB[state] || STATE_CENTERS[state] || STATE_CENTERS.Malaysia
  const seed = hashString(place?.id || place?._id || place?.name)
  return jitterCoord(center, seed)
}

export function attachRouteCoordinates(places, destinationConfig, locations = []) {
  const locationCoordIndex = buildLocationCoordinateIndex(locations)
  return places.map((place) => {
    const coord = inferPlaceCoordinate(place, destinationConfig, locations, locationCoordIndex)
    return { ...place, _routeLat: coord.lat, _routeLng: coord.lng }
  })
}

export function orderPlacesNearestNeighbor(places) {
  if (places.length <= 1) return [...places]
  if (places.length === 2) return [...places]

  let bestOrder = places
  let bestTotal = Infinity

  for (let start = 0; start < places.length; start += 1) {
    const remaining = places.filter((_, index) => index !== start)
    const ordered = [places[start]]

    while (remaining.length > 0) {
      const last = ordered[ordered.length - 1]
      let nearestIdx = 0
      let nearestDist = Infinity

      for (let i = 0; i < remaining.length; i += 1) {
        const dist = haversineKm(last, remaining[i])
        if (dist < nearestDist) {
          nearestDist = dist
          nearestIdx = i
        }
      }

      ordered.push(remaining.splice(nearestIdx, 1)[0])
    }

    let total = 0
    for (let i = 1; i < ordered.length; i += 1) {
      total += haversineKm(ordered[i - 1], ordered[i])
    }

    if (total < bestTotal) {
      bestTotal = total
      bestOrder = ordered
    }
  }

  return bestOrder
}

function initializeClusterSeeds(places, clusterCount) {
  const seeds = [places[0]]

  while (seeds.length < clusterCount) {
    const next = places.reduce(
      (best, place) => {
        const minDist = Math.min(...seeds.map((seed) => haversineKm(place, seed)))
        return minDist > best.minDist ? { place, minDist } : best
      },
      { place: places[0], minDist: -1 },
    )
    seeds.push(next.place)
  }

  return seeds
}

function assignPlacesToClusters(places, clusterCount) {
  if (clusterCount <= 1) return [places]

  const seeds = initializeClusterSeeds(places, clusterCount)
  let centroids = seeds.map((place) => placeCoord(place))
  let assignments = new Array(places.length).fill(0)

  for (let iter = 0; iter < 12; iter += 1) {
    for (let i = 0; i < places.length; i += 1) {
      let bestCluster = 0
      let bestDist = Infinity
      for (let c = 0; c < clusterCount; c += 1) {
        const dist = haversineKm(places[i], centroids[c])
        if (dist < bestDist) {
          bestDist = dist
          bestCluster = c
        }
      }
      assignments[i] = bestCluster
    }

    const nextCentroids = Array.from({ length: clusterCount }, () => ({ lat: 0, lng: 0, count: 0 }))
    for (let i = 0; i < places.length; i += 1) {
      const cluster = assignments[i]
      const coord = placeCoord(places[i])
      nextCentroids[cluster].lat += coord.lat
      nextCentroids[cluster].lng += coord.lng
      nextCentroids[cluster].count += 1
    }

    centroids = nextCentroids.map((entry, index) => {
      if (entry.count === 0) return placeCoord(seeds[index])
      return { lat: entry.lat / entry.count, lng: entry.lng / entry.count }
    })
  }

  const clusters = Array.from({ length: clusterCount }, () => [])
  for (let i = 0; i < places.length; i += 1) {
    clusters[assignments[i]].push(places[i])
  }

  return clusters
}

function balanceClusters(clusters, stopsPerDay) {
  const balanced = clusters.map((cluster) => [...cluster])
  const maxSize = stopsPerDay

  let changed = true
  while (changed) {
    changed = false
    const oversized = balanced.findIndex((cluster) => cluster.length > maxSize)
    if (oversized < 0) break

    const donor = balanced[oversized]
    const moving = donor.pop()
    let target = -1
    let bestDist = Infinity

    for (let i = 0; i < balanced.length; i += 1) {
      if (i === oversized || balanced[i].length >= maxSize) continue
      const dist = haversineKm(moving, centroid(balanced[i]))
      if (dist < bestDist) {
        bestDist = dist
        target = i
      }
    }

    if (target < 0) {
      donor.push(moving)
      break
    }

    balanced[target].push(moving)
    changed = true
  }

  const undersized = balanced.filter((cluster) => cluster.length < maxSize)
  const donors = balanced
    .map((cluster, index) => ({ cluster, index }))
    .filter(({ cluster }) => cluster.length > 0)
    .sort((a, b) => b.cluster.length - a.cluster.length)

  for (const bucket of undersized) {
    while (bucket.length < maxSize && donors.length > 0) {
      const donorInfo = donors.find(({ index }) => balanced[index].length > 1)
      if (!donorInfo) break

      const donorCluster = balanced[donorInfo.index]
      let moveIdx = 0
      let bestDist = Infinity
      for (let i = 0; i < donorCluster.length; i += 1) {
        const dist = haversineKm(donorCluster[i], centroid(bucket))
        if (dist < bestDist) {
          bestDist = dist
          moveIdx = i
        }
      }

      bucket.push(donorCluster.splice(moveIdx, 1)[0])
    }
  }

  return balanced.filter((cluster) => cluster.length > 0)
}

/**
 * Group places into geographically compact days and order stops to minimize backtracking.
 * Places should already be ranked by preference (highest score first).
 */
export function clusterPlacesIntoDays(places, dayCount, stopsPerDay, options = {}) {
  const { destinationConfig = null, locations = [] } = options
  if (dayCount <= 0 || places.length === 0) return []

  const withCoords = attachRouteCoordinates(places, destinationConfig, locations)

  if (dayCount === 1) {
    return [orderPlacesNearestNeighbor(withCoords)]
  }

  const rawClusters = assignPlacesToClusters(withCoords, dayCount)
  const balanced = balanceClusters(rawClusters, stopsPerDay)

  return balanced.map((dayPlaces) => orderPlacesNearestNeighbor(dayPlaces))
}
