/** True when the string is primarily Latin/English — keep as the canonical place name. */
export function isMostlyLatin(text) {
  if (!text || typeof text !== 'string') return true
  const latin = (text.match(/[A-Za-z0-9]/g) || []).length
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  if (cjk === 0) return true
  return latin >= cjk
}

export const CANONICAL_CATEGORIES = new Set([
  'FOOD',
  'CULTURE',
  'NATURE',
  'HIDDEN GEMS',
  'ADVENTURE',
  'STAY',
])

export function isCanonicalCategory(category) {
  return CANONICAL_CATEGORIES.has(String(category || '').trim().toUpperCase())
}

export function formatCategoryLabel(category) {
  if (!category) return 'Culture'
  const raw = String(category).trim()
  const upper = raw.toUpperCase()
  if (CANONICAL_CATEGORIES.has(upper)) {
    return upper
      .split(/[\s_]+/)
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ')
  }
  return raw.replace(/_/g, ' ')
}

/** Prefer a standard filter category over a social hashtag when both exist. */
export function pickDisplayCategory(categories, fallback) {
  const list = categories?.length ? categories : fallback ? [fallback] : []
  if (!list.length) return 'CULTURE'
  const canonical = list.find((c) => isCanonicalCategory(c))
  return canonical || list[0]
}

export function categoriesForDisplay(categories) {
  const list = categories?.length ? [...categories] : ['CULTURE']
  const canonical = list.filter((c) => isCanonicalCategory(c))
  const rest = list.filter((c) => !isCanonicalCategory(c))
  return [...canonical, ...rest].slice(0, 2)
}

export function shouldTranslateCategory(text, targetLang) {
  if (!text || typeof text !== 'string') return false
  if (isCanonicalCategory(text)) return false
  const hasCjk = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)
  if (targetLang === 'en') return true
  if (targetLang === 'zh-CN') return !hasCjk
  return true
}

/** English-style compact like counts (always Latin digits + K/M). */
export function formatLikeCount(n) {
  const num = Number(n) || 0
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 10_000) return `${Math.round(num / 1000)}K`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return String(num)
}

export function formatPlaceLikes(place) {
  if (place?.totalLikes != null) return formatLikeCount(place.totalLikes)
  if (place?.likesScore != null) return formatLikeCount(place.likesScore)
  const label = String(place?.likesLabel || place?.likes || '')
    .replace(/^🔥\s*/, '')
    .replace(/\s*likes?$/i, '')
    .trim()
  const wan = label.match(/([\d.]+)\s*万/)
  if (wan) return formatLikeCount(parseFloat(wan[1]) * 10_000)
  const digits = label.replace(/[^\d.]/g, '')
  if (digits) return formatLikeCount(parseFloat(digits))
  return label || '0'
}

export function shouldTranslatePlaceName(name, targetLang) {
  if (!name || typeof name !== 'string') return false
  const hasCjk = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(name)
  // Keep stored name when UI is Chinese; translate CJK names for EN / MS.
  if (targetLang === 'zh-CN') return false
  if (hasCjk) return true
  return !isMostlyLatin(name)
}

export function shouldTranslateDescription(text, targetLang) {
  if (!text || typeof text !== 'string') return false
  const hasCjk = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)
  if (targetLang === 'en') return hasCjk
  if (targetLang === 'zh-CN') return !hasCjk
  return true
}

/** Social captions for zh-CN; Google blurbs (English) for en/ms — easier to translate. */
export function pickPlaceDescription(social, google, targetLang) {
  const s = String(social || '').trim()
  const g = String(google || '').trim()
  if (targetLang === 'zh-CN') return s || g
  return g || s
}

/** Strip leading flag emojis (e.g. 🇲🇾) so translators don't prefix "MY"/"my". */
export function normalizeForTranslation(text) {
  return String(text || '')
    .replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '')
    .trim()
}

/**
 * True when `result` looks like a genuine translation of `original`, not a
 * silent fallback-to-original from a failed translate call. The batch API
 * returns the source text unchanged when the underlying translator errors,
 * so treating any truthy response as success would permanently cache the
 * untranslated text as "done" and it would never be retried.
 */
export function isGenuineTranslation(original, result, targetLang) {
  if (!result || typeof result !== 'string') return false
  if (result === original) return false
  const cjkCount = (result.match(/[一-鿿㐀-䶿]/g) || []).length
  if (targetLang === 'en' || targetLang === 'ms') {
    // A stray loanword (丼, 麵, etc.) can legitimately survive translation —
    // only treat it as a failed/no-op translation once a lot of CJK remains.
    if (cjkCount > 4) return false
  }
  return true
}
