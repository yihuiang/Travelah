/**
 * Normalize, clean, and merge MediaCrawler XHS (RedNote / 小红书) CSV rows.
 *
 * This is the main DATA CLEANING module:
 * - parseLikes, cleanDesc, firstImage … formatting helpers
 * - normalizeRow … CSV row → post object
 * - cleanPost … drop junk rows
 * - mergePosts … dedupe by platform + id
 */

const STATE_FROM_KEYWORD = [
  { pattern: /槟城|penang/i, state: 'Penang' },
  { pattern: /吉隆坡|kuala\s*lumpur|kl/i, state: 'Kuala Lumpur' },
  { pattern: /兰卡威|langkawi/i, state: 'Kedah' },
  { pattern: /马六甲|melaka|malacca/i, state: 'Melaka' },
  { pattern: /柔佛|johor|新山/i, state: 'Johor' },
  { pattern: /沙巴|sabah|亚庇|仙本那|kundasang|昆达山|kinabalu|神山|kota\s*kinabalu|\bkk\b/i, state: 'Sabah' },
  { pattern: /砂拉越|sarawak|古晋/i, state: 'Sarawak' },
  { pattern: /登嘉楼|terengganu/i, state: 'Terengganu' },
  { pattern: /吉兰丹|kelantan/i, state: 'Kelantan' },
  { pattern: /彭亨|pahang|金马伦|cameron/i, state: 'Pahang' },
  { pattern: /霹雳|perak|怡保|ipoh/i, state: 'Perak' },
  { pattern: /森美兰|negeri\s*sembilan/i, state: 'Negeri Sembilan' },
  { pattern: /玻璃市|perlis/i, state: 'Perlis' },
  { pattern: /雪兰莪|selangor/i, state: 'Selangor' },
  { pattern: /马来西亚|malaysia/i, state: 'Malaysia' },
]

const CATEGORY_RULES = [
  { id: 'FOOD', pattern: /美食|吃|餐厅|咖啡|小吃|food|culinary|restaurant|cafe|夜市/i },
  { id: 'NATURE', pattern: /自然|山|海|森林|沙滩|徒步|nature|beach|hike|公园/i },
  { id: 'CULTURE', pattern: /文化|博物馆|历史|艺术|传统|culture|museum|heritage|娘惹/i },
  { id: 'HIDDEN GEMS', pattern: /小众|隐藏|秘境|hidden|gem|打卡|秘境/i },
]

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

export function inferState({ sourceKeyword, ipLocation, batchLabel, title, description }) {
  const text = `${sourceKeyword || ''} ${ipLocation || ''} ${title || ''} ${description || ''}`
  for (const { pattern, state } of STATE_FROM_KEYWORD) {
    if (pattern.test(text)) return state
  }
  if (batchLabel === 'penang') return 'Penang'
  if (batchLabel === 'sabah') return 'Sabah'
  if (batchLabel === 'sarawak') return 'Sarawak'
  if (batchLabel === 'malaysia') return 'Malaysia'
  return 'Malaysia'
}

export function inferCategories({ title, description, tagList }) {
  const text = `${title} ${description} ${tagList}`
  const matched = CATEGORY_RULES.filter(({ pattern }) => pattern.test(text)).map((r) => r.id)
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
