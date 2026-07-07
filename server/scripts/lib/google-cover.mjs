import fs from 'node:fs'
import path from 'node:path'

/** Download a Google Places photo for a place ID into destPath. */
export async function downloadGoogleCover(apiKey, googlePlaceId, destPath, photoIndex = 0) {
  if (!apiKey) throw new Error('Missing GOOGLE_PLACES_API_KEY')
  if (!googlePlaceId) throw new Error('Missing googlePlaceId')

  const details = await fetch(`https://places.googleapis.com/v1/places/${googlePlaceId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'photos',
    },
  }).then((r) => r.json())

  const photoName = details.photos?.[photoIndex]?.name
  if (!photoName) return false

  const data = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&skipHttpRedirect=true&key=${apiKey}`,
  ).then((r) => r.json())

  if (!data.photoUri) return false

  const img = await fetch(data.photoUri)
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.writeFileSync(destPath, Buffer.from(await img.arrayBuffer()))
  return true
}

export function safeCoverFilename(name) {
  return String(name || 'place')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .slice(0, 120) || 'place'
}
