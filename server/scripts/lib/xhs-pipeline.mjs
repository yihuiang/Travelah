/**
 * Normalize, clean, and merge MediaCrawler XHS (RedNote / 小红书) CSV rows.
 *
 * This is the main DATA CLEANING module:
 * - parseLikes, cleanDesc, firstImage … formatting helpers
 * - normalizeRow … CSV row → post object
 * - cleanPost … drop junk rows
 * - mergePosts … dedupe by platform + id
 */

import { inferStateScored } from './infer-state.mjs'

const CATEGORY_RULES = [
  { id: 'FOOD', pattern: /美食|必吃|好吃|foodie|makan|餐厅推荐|大马美食|culinary|restaurant|cafe|coffee|小吃|夜市|肉骨|laksa|satay/i },
  { id: 'NATURE', pattern: /自然|沙滩|beach|waterfall|森林|forest|徒步|hike|national\s+park|pantai|gunung|海岛|island/i },
  { id: 'CULTURE', pattern: /文化|博物馆|历史|艺术|传统|culture|museum|heritage|娘惹|mosque|temple/i },
  { id: 'HIDDEN GEMS', pattern: /小众|隐藏|秘境|hidden\s+gem|underrated|off.?beat/i },
  { id: 'ADVENTURE', pattern: /冒险|adventure|diving|snorkel|rafting|zipline|camping|glamping|atv|theme\s+park/i },
]

const PHOTO_SPOT_RE = /拍照|摄影|机位|photo\s*spot|viewpoint|闪电|日落|夜景|延时|lightning|sunset|sunrise/i
const FOOD_INTENT_RE = /美食|必吃|foodie|makan|餐厅推荐|好吃|大马美食|restaurant\s+review|开盲盒.*娘惹|开盲盒.*美食/i

export function getField(row, name) {
  if (row[name] != null && row[name] !== '') return row[name]
  const bomKey = `\ufeff${name}`
  if (row[bomKey] != null && row[bomKey] !== '') return row[bomKey]
  const keys = Object.keys(row)
  const match = keys.find((k) => k.replace(/^\ufeff/, '') === name)
  return match ? row[match] : ''
}

export function parseLikes(value) {
  if (!value) return 0
  const raw = String(value).trim().replace(/,/g, '')
  const wan = raw.match(/^([\d.]+)\s*万/)
  if (wan) return Math.round(parseFloat(wan[1]) * 10000)
  const num = parseInt(raw.replace(/\D/g, ''), 10)
  return Number.isNaN(num) ? 0 : num
}

export function cleanDesc(text) {
  if (!text) return ''
  const cleaned = String(text)
    .replace(/#[^#\s\n\[]+(\[话题\])?#?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length < 8) return ''
  return cleaned.slice(0, 280)
}

export function firstImage(imageList) {
  if (!imageList) return ''
  const url = String(imageList).split(/[,;]/)[0]?.trim()
  return url || ''
}

export function firstTag(tagList, sourceKeyword) {
  if (tagList) {
    const tag = String(tagList).split(',')[0]?.trim()
    if (tag) return tag
  }
  return sourceKeyword || 'Malaysia'
}

export function formatLikes(value) {
  if (!value) return 'Trending'
  const raw = String(value).trim()
  return `🔥 ${raw} likes`
}

export function inferState({ sourceKeyword, ipLocation, batchLabel, title, description, location }) {
  return inferStateScored({
    sourceKeyword,
    location: location || ipLocation,
    title,
    description,
    batchLabel,
  })
}

export function inferCategories({ title, description, tagList }) {
  const text = `${title} ${description} ${tagList}`
  const photoSpot = PHOTO_SPOT_RE.test(text)
  const foodIntent = FOOD_INTENT_RE.test(text)
  const matched = CATEGORY_RULES.filter(({ id, pattern }) => {
    if (id === 'FOOD' && photoSpot && !foodIntent) return false
    if (id === 'FOOD' && /餐厅/.test(text) && photoSpot && !foodIntent) return false
    return pattern.test(text)
  }).map((r) => r.id)
  return matched.length ? [...new Set(matched)] : ['CULTURE']
}

export function normalizeRow(row, index, { batchLabel }) {
  const noteId = String(getField(row, 'note_id')).trim() || `row-${batchLabel}-${index}`
  const title = String(getField(row, 'title') || '').trim()
  const rawDesc = getField(row, 'desc')
  const description = cleanDesc(rawDesc) || title
  const sourceKeyword = String(getField(row, 'source_keyword') || '').trim()
  const ipLocation = String(getField(row, 'ip_location') || '').trim()
  const tagList = String(getField(row, 'tag_list') || '')

  return {
    id: noteId,
    platform: 'xhs',
    batch: batchLabel,
    title,
    description,
    image: firstImage(getField(row, 'image_list')),
    videoUrl: String(getField(row, 'video_url') || '').trim() || undefined,
    location: ipLocation || sourceKeyword || 'Malaysia',
    category: firstTag(tagList, sourceKeyword),
    state: inferState({ sourceKeyword, ipLocation, batchLabel, title, description }),
    categories: inferCategories({ title, description, tagList }),
    likes: String(getField(row, 'liked_count') || ''),
    likesScore: parseLikes(getField(row, 'liked_count')),
    likesLabel: formatLikes(getField(row, 'liked_count')),
    comments: String(getField(row, 'comment_count') || ''),
    shares: String(getField(row, 'share_count') || ''),
    collected: String(getField(row, 'collected_count') || ''),
    author: String(getField(row, 'nickname') || ''),
    noteUrl: String(getField(row, 'note_url') || ''),
    type: String(getField(row, 'type') || 'normal'),
    sourceKeyword,
  }
}

export function cleanPost(post) {
  if (!post.title || post.title === 'Untitled') {
    return { ok: false, reason: 'missing_title' }
  }
  if (post.title.length < 2) return { ok: false, reason: 'title_too_short' }
  if (!post.image) return { ok: false, reason: 'missing_image' }
  if (!post.description) return { ok: false, reason: 'missing_description' }
  if (!/^https?:\/\//i.test(post.image)) return { ok: false, reason: 'invalid_image_url' }
  return { ok: true }
}

export function mergePosts(items) {
  const byId = new Map()
  for (const item of items) {
    const key = `${item.platform}:${item.id}`
    const existing = byId.get(key)
    if (!existing || item.likesScore > existing.likesScore) {
      byId.set(key, item)
    }
  }
  return [...byId.values()].sort((a, b) => b.likesScore - a.likesScore)
}
