/**
 * Normalize, clean, and merge InstaCrawler Instagram CSV rows.
 * Column layout matches MediaCrawler / XHS exports (note_id, desc, image_list, …).
 */
import {
  getField,
  parseLikes,
  firstImage,
  firstTag,
  formatLikes,
  inferState,
  inferCategories,
  cleanPost as cleanPostBase,
  mergePosts,
} from './xhs-pipeline.mjs'
import { isPromotionalPost } from './post-quality.mjs'

export function cleanDesc(text) {
  if (!text) return ''
  const cleaned = String(text)
    .replace(/#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length < 8) return ''
  return cleaned.slice(0, 280)
}

export function cleanPost(post) {
  if (isPromotionalPost(post)) {
    return { ok: false, reason: 'promotional' }
  }
  return cleanPostBase(post)
}

export function normalizeRow(row, index, { batchLabel }) {
  const noteId = String(getField(row, 'note_id')).trim() || `ig-${batchLabel}-${index}`
  const title = String(getField(row, 'title') || '').trim()
  const rawDesc = getField(row, 'desc')
  const description = cleanDesc(rawDesc) || title
  const sourceKeyword = String(getField(row, 'source_keyword') || '').trim()
  const ipLocation = String(getField(row, 'ip_location') || '').trim()
  const tagList = String(getField(row, 'tag_list') || '')

  return {
    id: noteId,
    platform: 'ig',
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

export { mergePosts }
