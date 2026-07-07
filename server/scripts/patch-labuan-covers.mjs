/**
 * Replace Labuan place covers with curated Google photos (no Douyin CDN).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import { spawnSync } from 'child_process'
import { getPlaceDetails, normalizeGoogleDetails } from './lib/google-places.mjs'
import { downloadGoogleCover, safeCoverFilename } from './lib/google-cover.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const placesJsonPath = path.resolve(__dirname, '../data/places.json')
const placesDir = path.resolve(__dirname, '../../client/public/places')
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'
const apiKey = process.env.GOOGLE_PLACES_API_KEY

/** Curated Google Place IDs + photo index (0 = best landscape, no people/text). */
const LABUAN_COVERS = [
  {
    id: 'p_76a4167f189d',
    name: 'Labuan Island',
    googlePlaceId: 'ChIJiyvefhUXIzIRlvz3b4DWJgo', // Pantai Pancur Hitam
    photoIndex: 0,
  },
  {
    id: 'p_dfc427203262',
    name: 'Labuan Peace Park',
    googlePlaceId: 'ChIJH0LgbVcXIzIRS-1V02PHn_E',
    photoIndex: 0,
  },
  {
    id: 'p_8c86498769e5',
    name: 'Labuan Wreck Diving',
    googlePlaceId: 'ChIJWekTe8MYIzIRJZeS2f_ZRk8', // Muzium Marin Labuan
    photoIndex: 1,
  },
]

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit', shell: true })
  if (r.status !== 0) throw new Error(`${cmd} failed`)
}

async function main() {
  if (!apiKey) throw new Error('Missing GOOGLE_PLACES_API_KEY')

  const client = new MongoClient(uri)
  await client.connect()
  const collection = client.db(dbName).collection('places')

  try {
    for (const item of LABUAN_COVERS) {
      const details = await getPlaceDetails(apiKey, item.googlePlaceId)
      const google = normalizeGoogleDetails(details)

      const filename = `${safeCoverFilename(item.name)}.jpg`
      const dest = path.join(placesDir, filename)
      const ok = await downloadGoogleCover(apiKey, item.googlePlaceId, dest, item.photoIndex)
      if (!ok) {
        console.log(`skip ${item.name}: no Google photo at index ${item.photoIndex}`)
        continue
      }

      const patch = {
        googlePlaceId: item.googlePlaceId,
        googleRating: google.googleRating,
        googleReviewCount: google.googleReviewCount,
        googleMapsUri: google.googleMapsUri,
        googleDescription: google.googleDescription,
        googleEnrichedAt: google.googleEnrichedAt,
        coverImage: `/places/${filename}`,
      }
      if (google.openingHours?.length) {
        patch.googleOpeningHours = google.openingHours
        patch.openingHours = google.openingHours
        patch.openingHoursSource = 'google'
      }

      await collection.updateOne({ _id: item.id }, { $set: patch })
      console.log(`ok ${item.name} → /places/${filename} (${google.googleRating ?? '?'}★)`)
    }

    const all = await collection.find({}).toArray()
    fs.writeFileSync(
      placesJsonPath,
      JSON.stringify(all.map(({ _id, ...rest }) => ({ _id, ...rest })), null, 2),
      'utf8',
    )
    console.log(`Synced places.json (${all.length} places)`)
  } finally {
    await client.close()
  }

  run('npm', ['run', 'upload:r2:places'])
  run('npm', ['run', 'sync:google-enrichment'])
  console.log('\nDone — hard refresh Explore (Ctrl+F5).')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
