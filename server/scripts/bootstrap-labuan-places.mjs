/**
 * Bootstrap / refresh Labuan places from Douyin labuan batch posts.
 * Only title+description are used — not the crawl keyword "labuan travel".
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { inferDouyinState } from './lib/dy-pipeline.mjs'
import {
  isMalaysianLabuanPost,
  isLabuanWreckPost,
  isLabuanPeaceParkPost,
} from './lib/labuan-relevance.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const placesPath = path.resolve(__dirname, '../data/places.json')
const mergedPath = path.resolve(__dirname, '../data/merged-data.json')
const dyPath = path.resolve(__dirname, '../data/platforms/dy.json')

const SUB_PLACES = [
  {
    name: 'Labuan Wreck Diving',
    match: isLabuanWreckPost,
    categories: ['ADVENTURE', 'NATURE'],
  },
  {
    name: 'Labuan Peace Park',
    match: isLabuanPeaceParkPost,
    categories: ['CULTURE'],
  },
]

function stablePlaceId(name, state) {
  const key = `${name.trim().toLowerCase().replace(/\s+/g, ' ')}|${(state || 'Malaysia').trim().toLowerCase()}`
  const digest = crypto.createHash('sha1').update(key, 'utf8').digest('hex').slice(0, 12)
  return `p_${digest}`
}

function formatLikesLabel(score) {
  if (score >= 10000) {
    const wan = score / 10000
    const label = wan === Math.floor(wan) ? `${Math.floor(wan)}万+` : `${wan.toFixed(1)}万`
    return `🔥 ${label} likes`
  }
  return `🔥 ${score} likes`
}

function buildPlace({ name, state, postIds, posts, categories }) {
  const byId = new Map(posts.map((p) => [String(p.id), p]))
  let totalLikes = 0
  let totalCollected = 0
  let bestLikes = -1
  let coverImage = null
  let description = ''
  const platforms = {}

  for (const pid of postIds) {
    const post = byId.get(String(pid))
    if (!post) continue
    const likes = Number(post.likesScore) || 0
    totalLikes += likes
    totalCollected += Number(String(post.collected || '0').replace(/\D/g, '')) || 0
    const platform = post.platform || 'dy'
    platforms[platform] = (platforms[platform] || 0) + 1
    if (likes > bestLikes) {
      bestLikes = likes
      coverImage = post.image || coverImage
      description = (post.description || post.title || '').slice(0, 160)
    }
  }

  const primaryPlatform = Object.entries(platforms).sort((a, b) => b[1] - a[1])[0]?.[0] || 'dy'

  return {
    _id: stablePlaceId(name, state),
    name,
    state,
    categories,
    totalLikes,
    likesLabel: formatLikesLabel(totalLikes),
    totalCollected,
    postCount: postIds.length,
    coverImage,
    description: description || `Travel tips and local posts about ${name}.`,
    postIds,
    extractSources: ['batch'],
    primaryPlatform,
    platforms,
  }
}

function fixLabuanPostState(post) {
  if (post.batch !== 'labuan') return post
  const state = inferDouyinState({
    batchLabel: 'labuan',
    sourceKeyword: post.sourceKeyword || '',
    ipLocation: post.location || '',
    title: post.title || '',
    description: post.description || '',
  })
  return { ...post, state }
}

export function rebuildLabuanPlaces(posts, places) {
  const labuanPosts = posts.filter((p) => p.batch === 'labuan')
  const myPosts = labuanPosts.filter(isMalaysianLabuanPost)

  const assigned = new Set()
  const newPlaces = []

  for (const rule of SUB_PLACES) {
    const matched = myPosts.filter((p) => rule.match(p) && !assigned.has(p.id))
    if (!matched.length) continue
    for (const p of matched) assigned.add(p.id)
    newPlaces.push(
      buildPlace({
        name: rule.name,
        state: 'Labuan',
        postIds: matched.map((p) => p.id),
        posts: myPosts,
        categories: rule.categories,
      }),
    )
  }

  const hubPosts = myPosts.filter((p) => !assigned.has(p.id))
  if (hubPosts.length) {
    newPlaces.unshift(
      buildPlace({
        name: 'Labuan Island',
        state: 'Labuan',
        postIds: hubPosts.map((p) => p.id),
        posts: myPosts,
        categories: ['NATURE', 'CULTURE'],
      }),
    )
  }

  const newIds = new Set(newPlaces.map((p) => p._id))
  const kept = places.filter((p) => p.state !== 'Labuan' || newIds.has(p._id))
  const byId = new Map(kept.map((p) => [p._id, p]))
  for (const place of newPlaces) byId.set(place._id, place)

  const merged = [...byId.values()].sort(
    (a, b) => (b.totalLikes || 0) - (a.totalLikes || 0) || (b.postCount || 0) - (a.postCount || 0),
  )

  return {
    places: merged,
    stats: {
      batchTotal: labuanPosts.length,
      relevant: myPosts.length,
      places: newPlaces.length,
      linkedPosts: myPosts.length,
    },
  }
}

function main() {
  const posts = JSON.parse(fs.readFileSync(mergedPath, 'utf8'))
  const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'))

  let stateFixed = 0
  const fixedPosts = posts.map((post) => {
    if (post.batch !== 'labuan') return post
    const next = fixLabuanPostState(post)
    if (next.state !== post.state) stateFixed += 1
    return next
  })

  const { places: merged, stats } = rebuildLabuanPlaces(fixedPosts, places)

  fs.writeFileSync(mergedPath, JSON.stringify(fixedPosts, null, 2), 'utf8')

  if (fs.existsSync(dyPath)) {
    const dy = JSON.parse(fs.readFileSync(dyPath, 'utf8'))
    const dyById = new Map(fixedPosts.map((p) => [p.id, p]))
    const dyFixed = dy.map((p) => {
      const ref = dyById.get(p.id)
      return ref && p.batch === 'labuan' ? { ...p, state: ref.state } : p
    })
    fs.writeFileSync(dyPath, JSON.stringify(dyFixed, null, 2), 'utf8')
  }

  fs.writeFileSync(placesPath, JSON.stringify(merged, null, 2), 'utf8')

  console.log(`Labuan batch: ${stats.batchTotal} posts`)
  console.log(`  Relevant to Malaysian Labuan: ${stats.relevant}`)
  console.log(`  Post states corrected: ${stateFixed}`)
  console.log(`  Labuan places: ${stats.places} (${stats.linkedPosts} posts linked)`)
  for (const p of merged.filter((x) => x.state === 'Labuan')) {
    console.log(`    · ${p.name}: ${p.postCount} posts`)
  }
  console.log(`\nplaces.json: ${merged.length} total`)
  console.log('\nNext: npm run seed:mongodb && npm run seed:places')
}

main()
