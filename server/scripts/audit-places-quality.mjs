/**
 * Audit NLP-linked places and flag low-confidence / mismatched data.
 *
 * Usage:
 *   npm run audit:places
 *   npm run audit:places -- --min-confidence 80
 *   npm run audit:places -- --limit 30
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  detectLocationEntities,
  entitiesConflict,
  scorePlacePosts,
} from './lib/post-quality.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const placesPath = path.resolve(__dirname, '../data/places.json')
const postsPath = path.resolve(__dirname, '../data/merged-data.json')
const reportPath = path.resolve(__dirname, '../data/places-quality-report.json')

function parseArgs() {
  const minConfidence = Number(
    (process.argv.find((arg) => arg.startsWith('--min-confidence=')) || '').split('=')[1] || 70,
  )
  const limit = Number((process.argv.find((arg) => arg.startsWith('--limit=')) || '').split('=')[1] || 25)
  return { minConfidence, limit }
}

function loadPostsById() {
  const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'))
  const map = new Map()
  for (const post of posts) {
    if (post?.id) map.set(String(post.id), post)
  }
  return map
}

async function main() {
  const { minConfidence, limit } = parseArgs()
  const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'))
  const postsById = loadPostsById()

  const audited = places.map((place) => {
    const posts = (place.postIds || [])
      .map((id) => postsById.get(String(id)))
      .filter(Boolean)
    const quality = scorePlacePosts(place, posts)
    const placeEntities = detectLocationEntities(place.name)
    const descEntities = detectLocationEntities(place.description || '')

    return {
      id: place._id || place.id,
      name: place.name,
      state: place.state,
      postCount: place.postCount || posts.length,
      descriptionSnippet: (place.description || '').slice(0, 100),
      placeEntities,
      descriptionEntities: descEntities,
      descriptionMismatch:
        placeEntities.length > 0 &&
        descEntities.length > 0 &&
        entitiesConflict(placeEntities, descEntities),
      ...quality,
    }
  })

  const flagged = audited
    .filter((item) => item.confidence < minConfidence || item.flags.length > 0)
    .sort((a, b) => a.confidence - b.confidence)

  const summary = {
    generatedAt: new Date().toISOString(),
    totalPlaces: places.length,
    flaggedCount: flagged.length,
    minConfidence,
    highConfidenceCount: audited.filter((item) => item.confidence >= 85 && item.flags.length === 0).length,
    mediumConfidenceCount: audited.filter(
      (item) => item.confidence >= minConfidence && item.confidence < 85,
    ).length,
    lowConfidenceCount: flagged.filter((item) => item.confidence < minConfidence).length,
    topIssues: flagged.slice(0, limit),
  }

  fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

  console.log(`Audited ${summary.totalPlaces} places`)
  console.log(`High confidence (>=85): ${summary.highConfidenceCount}`)
  console.log(`Flagged / needs review: ${summary.flaggedCount}`)
  console.log(`Report written to ${reportPath}`)
  console.log('')
  console.log(`Top ${Math.min(limit, flagged.length)} places to review:`)
  for (const item of summary.topIssues) {
    console.log(
      `  [${item.confidence}%] ${item.id} ${item.name} (${item.state}) — ${item.flags.join(', ') || 'review'}`,
    )
    if (item.descriptionMismatch) {
      console.log(`      description mentions: ${item.descriptionEntities.join(', ')}`)
    }
    for (const sample of item.irrelevantSamples || []) {
      console.log(`      mismatch post: ${sample.id} [${sample.entities.join(', ') || 'no entity'}] ${sample.title}`)
    }
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
