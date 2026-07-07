/**
 * One-off fix: re-upload local place cover photos whose filename contains
 * CJK characters, using the AWS SDK directly (proper UTF-8 handling)
 * instead of the Windows `aws.exe` CLI, which mangles non-ASCII filenames
 * into literal "?" characters when shelling out via spawnSync.
 *
 * Usage: node scripts/fix-cjk-r2-uploads.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const placesJsonPath = path.resolve(__dirname, '../data/places.json')
const placesDir = path.resolve(__dirname, '../../client/public/places')
const bucket = process.env.R2_BUCKET || 'travelah-posts'
const endpoint = (process.env.R2_ENDPOINT_URL || '').replace(/\/$/, '')

if (!endpoint) throw new Error('Missing R2_ENDPOINT_URL in server/.env')

// Credentials come from the default AWS provider chain (~/.aws/credentials),
// same as the `aws.exe` CLI already used by upload-r2-assets.mjs.
const client = new S3Client({
  region: 'auto',
  endpoint,
})

const places = JSON.parse(fs.readFileSync(placesJsonPath, 'utf8'))
const cjkPattern = /[一-鿿㐀-䶿]/

const targets = places.filter(
  (p) => typeof p.coverImage === 'string' && p.coverImage.startsWith('/places/') && cjkPattern.test(p.coverImage),
)

console.log(`Found ${targets.length} places with CJK-named local cover images.`)

let uploaded = 0
let missing = 0
let failed = 0

for (const [i, place] of targets.entries()) {
  const filename = decodeURIComponent(place.coverImage.replace(/^\/places\//, ''))
  const localPath = path.join(placesDir, filename)

  if (!fs.existsSync(localPath)) {
    missing += 1
    console.log(`  [${i + 1}/${targets.length}] missing local file — ${filename}`)
    continue
  }

  try {
    const body = fs.readFileSync(localPath)
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `places/${filename}`,
        Body: body,
        ContentType: 'image/jpeg',
      }),
    )
    uploaded += 1
    if ((i + 1) % 20 === 0 || i === targets.length - 1) {
      console.log(`  [${i + 1}/${targets.length}] uploaded ${uploaded} so far…`)
    }
  } catch (err) {
    failed += 1
    console.log(`  [${i + 1}/${targets.length}] error — ${filename}: ${err.message}`)
  }
}

console.log(`\nDone. Uploaded ${uploaded}, missing locally ${missing}, failed ${failed}.`)
