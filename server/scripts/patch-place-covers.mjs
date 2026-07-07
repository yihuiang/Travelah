/**
 * Patch place cover images in MongoDB.
 *
 * Usage:
 *   node scripts/patch-place-covers.mjs --set coverImage=/places/Foo.jpg --ids=p_abc
 *   node scripts/patch-place-covers.mjs --google --ids=p_abc,p_def
 *   node scripts/patch-place-covers.mjs --google --page=2
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import { enrichPlaceFromGoogle } from './lib/google-places.mjs'
import { downloadGoogleCover, safeCoverFilename } from './lib/google-cover.mjs'
import { filterByIds, parseExploreArgs, sliceExplorePage } from './lib/explore-page.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'
const apiKey = process.env.GOOGLE_PLACES_API_KEY
const placesDir = path.resolve(__dirname, '../../client/public/places')
const useGoogle = process.argv.includes('--google')
const force = process.argv.includes('--force')
const { page, pageSize, ids } = parseExploreArgs()

const setArgs = process.argv.filter((a) => a.startsWith('--set=')).map((a) => a.slice(6))
const manualPatch = Object.fromEntries(
  setArgs.map((pair) => {
    const idx = pair.indexOf('=')
    return [pair.slice(0, idx), pair.slice(idx + 1)]
  }),
)

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  const collection = client.db(dbName).collection('places')

  try {
    let places = await collection.find({}).sort({ totalLikes: -1 }).toArray()
    places = filterByIds(places, ids)
    places = sliceExplorePage(places, { page, pageSize })

    if (!places.length) {
      console.log('No places matched.')
      return
    }

    for (const place of places) {
      if (useGoogle) {
        if (!apiKey) throw new Error('Missing GOOGLE_PLACES_API_KEY')
        const result = place.googlePlaceId
          ? { ok: true, googlePlaceId: place.googlePlaceId }
          : await enrichPlaceFromGoogle(apiKey, place)
        if (!result.ok && !result.googlePlaceId) {
          console.log(`skip ${place.name}: no Google match`)
          continue
        }
        const googlePlaceId = result.googlePlaceId || place.googlePlaceId
        const filename = `${safeCoverFilename(place.name)}.jpg`
        const dest = path.join(placesDir, filename)
        if (!force && fs.existsSync(dest)) {
          await collection.updateOne(
            { _id: place._id },
            { $set: { coverImage: `/places/${filename}`, googlePlaceId } },
          )
          console.log(`unchanged file ${place.name} → /places/${filename}`)
          continue
        }
        const ok = await downloadGoogleCover(apiKey, googlePlaceId, dest)
        if (!ok) {
          console.log(`skip ${place.name}: no Google photo`)
          continue
        }
        await collection.updateOne(
          { _id: place._id },
          { $set: { coverImage: `/places/${filename}`, googlePlaceId } },
        )
        console.log(`ok ${place.name} → /places/${filename}`)
        continue
      }

      if (Object.keys(manualPatch).length) {
        await collection.updateOne({ _id: place._id }, { $set: manualPatch })
        console.log(`ok ${place.name}`, manualPatch)
      }
    }

    if (!useGoogle && !Object.keys(manualPatch).length) {
      console.log('Pass --google or --set field=value')
    }
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
