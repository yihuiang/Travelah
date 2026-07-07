/**
 * Download real photos for Explore page 6+ places without /places/ covers.
 * Replaces Douyin text thumbnails (and expiring CDN URLs) with local curated files.
 * This is the single cover-curation script — older fix-wording-covers* scripts were removed.
 *
 * Usage:
 *   node scripts/curate-wording-covers.mjs
 *   node scripts/curate-wording-covers.mjs --apply
 *   node scripts/curate-wording-covers.mjs --apply --limit=50
 */
import { MongoClient } from 'mongodb'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

const PAGE_SIZE = 9
const START_PAGE = 6
const apply = process.argv.includes('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB || 'travelah'
const r2Base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
const root = path.resolve(__dirname, '../..')
const placesDir = path.join(root, 'client/public/places')
const mergedFile = path.join(root, 'server/data/merged-data.json')
const placesJsonFile = path.join(root, 'server/data/places.json')

const isDouyin = (u) => /douyinpic\.com/i.test(u || '')
const isLocalPlaces = (u) => String(u || '').startsWith('/places/')

function safeFilename(name) {
  const base = String(name || 'place')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .slice(0, 120)
  return base || 'place'
}

function extractXhsFileId(url) {
  const match = String(url || '').match(/\/(1040g[^/!\?]+)/i)
  return match ? match[1] : null
}

function resolveDownloadUrl(source) {
  if (!source) return null
  if (source.startsWith('/posts/') || source.startsWith('/places/')) {
    if (r2Base) return `${r2Base}${encodeURI(source)}`
    const local = path.join(root, 'client/public', source.replace(/^\//, ''))
    if (fs.existsSync(local)) return `file://${local}`
    return null
  }
  if (/rednotecdn\.com/i.test(source)) {
    const id = extractXhsFileId(source)
    if (id) return `https://sns-img-bd.xhscdn.com/${id}`
  }
  if (/^https?:\/\//i.test(source)) return source
  return null
}

function isImageBuffer(buf) {
  if (!buf || buf.length < 4) return false
  const h = buf.slice(0, 4).toString('hex')
  return h.startsWith('ffd8') || h.startsWith('8950') || h.startsWith('4749') || h.startsWith('5249')
}

async function downloadToFile(url, destPath) {
  if (url.startsWith('file://')) {
    fs.copyFileSync(url.replace('file://', ''), destPath)
    const buf = fs.readFileSync(destPath)
    return isImageBuffer(buf) ? buf.length : 0
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'follow',
  })
  if (!res.ok) return 0
  const buf = Buffer.from(await res.arrayBuffer())
  if (!isImageBuffer(buf) || buf.length < 2048) return 0
  fs.writeFileSync(destPath, buf)
  return buf.length
}

function scorePost(post, place) {
  if (!post?.image || isDouyin(post.image)) return -1
  let score = post.likesScore || 0
  if (post.imageLocal) score += 5000
  if (/rednotecdn|xhscdn/i.test(post.image)) score += 800
  if (/instagram|fbcdn/i.test(post.image)) score += 600
  if (post.state === place.state) score += 400
  const text = `${post.title || ''} ${post.description || ''}`
  const name = place.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(name, 'i').test(text)) score += 2000
  const words = place.name.split(/\s+/).filter((w) => w.length > 3)
  if (words.some((w) => text.toLowerCase().includes(w.toLowerCase()))) score += 500
  return score
}

function bestPhotoSource(place, postById, merged) {
  const seen = new Set()
  const candidates = []

  for (const id of place.postIds || []) {
    const post = postById[id]
    if (!post) continue
    const score = scorePost(post, place)
    if (score < 0) continue
    candidates.push({ score, url: post.imageLocal || post.image, postId: id })
    seen.add(post.image)
  }

  // Fallback: search merged posts mentioning this place name
  const nameKey = place.name.trim()
  if (nameKey.length >= 4) {
    for (const post of merged) {
      if (!post.image || isDouyin(post.image) || seen.has(post.image)) continue
      const text = `${post.title || ''} ${post.description || ''}`
      if (!text.toLowerCase().includes(nameKey.toLowerCase())) continue
      const score = scorePost(post, place)
      if (score >= 0) candidates.push({ score, url: post.imageLocal || post.image, postId: post.id })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates[0] || null
}

/** Needs curated /places/ cover: Douyin text thumb, or any non-local cover on page 6+. */
function needsCuratedCover(cover) {
  if (isLocalPlaces(cover)) return false
  return isDouyin(cover) || !isLocalPlaces(cover)
}

const merged = JSON.parse(fs.readFileSync(mergedFile, 'utf8'))
const postById = Object.fromEntries(merged.map((p) => [p.id, p]))

if (!fs.existsSync(placesDir)) fs.mkdirSync(placesDir, { recursive: true })

const client = new MongoClient(uri)
await client.connect()
const collection = client.db(dbName).collection('places')
const sorted = await collection.find({}).sort({ totalLikes: -1 }).toArray()
const startIdx = (START_PAGE - 1) * PAGE_SIZE
const targets = sorted.slice(startIdx).filter((p) => needsCuratedCover(p.coverImage))

console.log(`\nPage ${START_PAGE}+ without /places/ cover: ${targets.length}`)
console.log(`Mode: ${apply ? 'APPLY' : 'dry-run'} | limit: ${limit === Infinity ? 'none' : limit}\n`)

const results = { ok: [], skip: [], fail: [] }
let done = 0

for (const place of targets) {
  if (done >= limit) break

  const baseName = safeFilename(place.name)
  const existingFiles = fs.readdirSync(placesDir)
  const existing = existingFiles.find(
    (f) => f.replace(/\.[^.]+$/, '').toLowerCase() === baseName.toLowerCase(),
  )

  if (existing) {
    const coverPath = `/places/${existing}`
    if (apply && place.coverImage !== coverPath) {
      await collection.updateOne({ _id: place._id }, { $set: { coverImage: coverPath } })
    }
    results.ok.push({ name: place.name, file: existing, note: 'existing' })
    done += 1
    continue
  }

  const src = bestPhotoSource(place, postById, merged)
  if (!src) {
    results.skip.push({ name: place.name, id: place._id })
    continue
  }

  const downloadUrl = resolveDownloadUrl(src.url)
  if (!downloadUrl) {
    results.fail.push({ name: place.name, reason: 'unresolved URL' })
    continue
  }

  const ext = /\.png/i.test(src.url) ? '.png' : '.jpg'
  const filename = `${baseName}${ext}`
  const dest = path.join(placesDir, filename)
  const coverPath = `/places/${filename}`

  if (!apply) {
    console.log(`[dry-run] ${place.name} → ${coverPath}`)
    results.ok.push({ name: place.name, file: filename, dry: true })
    done += 1
    continue
  }

  try {
    const size = await downloadToFile(downloadUrl, dest)
    if (!size) {
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      results.fail.push({ name: place.name, reason: 'bad download' })
      continue
    }
    await collection.updateOne({ _id: place._id }, { $set: { coverImage: coverPath } })
    console.log(`✓ ${place.name} → ${filename} (${Math.round(size / 1024)}KB)`)
    results.ok.push({ name: place.name, file: filename, bytes: size, id: place._id })
    done += 1
  } catch (err) {
    results.fail.push({ name: place.name, reason: err.message })
  }
}

if (apply && results.ok.length && fs.existsSync(placesJsonFile)) {
  try {
    const jsonPlaces = JSON.parse(fs.readFileSync(placesJsonFile, 'utf8'))
    const byId = new Map(jsonPlaces.map((p) => [p._id, p]))
    let synced = 0
    for (const r of results.ok) {
      if (!r.file || !r.id) continue
      if (byId.has(r.id)) {
        byId.get(r.id).coverImage = `/places/${r.file}`
        synced += 1
      }
    }
    if (synced) {
      fs.writeFileSync(placesJsonFile, `${JSON.stringify(jsonPlaces, null, 2)}\n`, 'utf8')
      console.log(`\nSynced ${synced} entries in places.json`)
    }
  } catch {
    /* optional */
  }
}

console.log(`\n=== DONE ===`)
console.log(`Curated: ${results.ok.length} | Skipped: ${results.skip.length} | Failed: ${results.fail.length}`)
if (results.skip.length) {
  console.log('\nNo photo source found (need manual upload):')
  for (const s of results.skip.slice(0, 20)) console.log(`  - ${s.name}`)
}
if (apply && results.ok.length) console.log('\nRun: npm run upload:r2:places')

await client.close()
