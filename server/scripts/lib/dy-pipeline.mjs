/**
 * Normalize, clean, and merge MediaCrawler Douyin (抖音) CSV rows.
 */
import {
  getField,
  parseLikes,
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
    .replace(/#[^#\s\n]+/g, '')
    .replace(/@[^\s\n]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length < 8) return ''
  return cleaned.slice(0, 280)
}

function firstLine(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) || ''
}

import { isMalaysianLabuanPost } from './labuan-relevance.mjs'

export function inferDouyinState(ctx) {
  if (ctx.batchLabel === 'ipoh') return 'Perak'
  if (ctx.batchLabel === 'penang') return 'Penang'
  if (ctx.batchLabel === 'kl') return 'Kuala Lumpur'
  if (ctx.batchLabel === 'labuan') {
    const contentState = inferState({
      sourceKeyword: '',
      ipLocation: '',
      batchLabel: '',
      title: ctx.title,
      description: ctx.description,
      location: '',
    })
    if (contentState && contentState !== 'Malaysia' && contentState !== 'Labuan') {
      return contentState
    }
    if (isMalaysianLabuanPost({ title: ctx.title, description: ctx.description })) {
      return 'Labuan'
    }
    return contentState || 'Malaysia'
  }
  return inferState(ctx)
}

export function normalizeRow(row, index, { batchLabel }) {
  const awemeId = String(getField(row, 'aweme_id')).trim() || `dy-${batchLabel}-${index}`
  const rawDesc = getField(row, 'desc')
  const rawTitle = String(getField(row, 'title') || '').trim()
  const title = rawTitle || firstLine(rawDesc).slice(0, 120)
  const description = cleanDesc(rawDesc) || cleanDesc(rawTitle) || title
  const sourceKeyword = String(getField(row, 'source_keyword') || '').trim()
  const ipLocation = String(getField(row, 'ip_location') || '').trim()

  return {
    id: awemeId,
    platform: 'dy',
    batch: batchLabel,
    title,
    description,
    image: String(getField(row, 'cover_url') || '').trim(),
    videoUrl: String(getField(row, 'video_download_url') || '').trim() || undefined,
    location: ipLocation || sourceKeyword || 'Malaysia',
    category: sourceKeyword || 'Malaysia',
    state: inferDouyinState({ sourceKeyword, ipLocation, batchLabel, title, description }),
    categories: inferCategories({ title, description, tagList: sourceKeyword }),
    likes: String(getField(row, 'liked_count') || ''),
    likesScore: parseLikes(getField(row, 'liked_count')),
    likesLabel: formatLikes(getField(row, 'liked_count')),
    comments: String(getField(row, 'comment_count') || ''),
    shares: String(getField(row, 'share_count') || ''),
    collected: String(getField(row, 'collected_count') || ''),
    author: String(getField(row, 'nickname') || ''),
    noteUrl: String(getField(row, 'aweme_url') || ''),
    type: 'video',
    sourceKeyword,
  }
}

export function cleanPost(post) {
  if (isPromotionalPost(post)) {
    return { ok: false, reason: 'promotional' }
  }
  return cleanPostBase(post)
}

export { mergePosts }
