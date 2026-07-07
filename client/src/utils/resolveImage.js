/** RedNote CDN links expire and block direct browser hotlinking. */

const R2_PUBLIC_BASE = (import.meta.env.VITE_R2_PUBLIC_URL || '').replace(/\/$/, '')

/** Local public paths (/images, /posts, /places) → R2 CDN when VITE_R2_PUBLIC_URL is set. */
export function resolvePublicAssetUrl(path) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path

  const [pathname, query = ''] = String(path).split('?')
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname.replace(/^\/+/, '')}`

  const onR2 =
    R2_PUBLIC_BASE &&
    (normalized.startsWith('/images/') ||
      normalized.startsWith('/posts/') ||
      normalized.startsWith('/places/') ||
      normalized.startsWith('/avatars/'))

  if (onR2) {
    const remote = `${R2_PUBLIC_BASE}${encodeURI(normalized)}`
    return query ? `${remote}?${query}` : remote
  }

  return path
}

export function isRedNoteCdn(url) {
  return typeof url === 'string' && /rednotecdn\.com/i.test(url)
}

export function isInstagramCdn(url) {
  return typeof url === 'string' && /fbcdn\.net|cdninstagram\.com/i.test(url)
}

function extractXhsFileId(url) {
  if (!url) return null
  const match = String(url).match(/\/(1040g[^/!\?]+)/i)
  return match ? match[1] : null
}

/** Map rednotecdn cover URLs to xhscdn mirrors that still load in the browser. */
export function resolveXhsImageUrl(imageUrl, { videoUrl } = {}) {
  if (!imageUrl && !videoUrl) return null
  if (imageUrl && !isRedNoteCdn(imageUrl)) return imageUrl

  const fileId = extractXhsFileId(imageUrl) || extractXhsFileId(videoUrl)
  if (fileId) return `https://sns-img-bd.xhscdn.com/${fileId}`

  return imageUrl || null
}

/** Display URL for a post — prefers local cache, then xhscdn mirror, then API fallback. */
export function getPostImageUrl(post) {
  if (!post) return null
  if (post.imageLocal) return resolvePublicAssetUrl(post.imageLocal) || post.imageLocal

  const resolved = resolveXhsImageUrl(post.image, { videoUrl: post.videoUrl })
  if (resolved && !isInstagramCdn(post.image)) return resolved

  const id = post.id || post.postId
  if (id && post.image) return `/api/posts/${id}/image`
  return null
}

/** Display URL for place cover images. */
export function getPlaceImageUrl(coverImage) {
  if (!coverImage) return null

  let url = coverImage
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
    url = `/${url.replace(/^\/+/, '')}`
  }

  const localOrRemote = resolvePublicAssetUrl(url) || url
  if (!isRedNoteCdn(localOrRemote)) return localOrRemote
  return resolveXhsImageUrl(localOrRemote)
}
