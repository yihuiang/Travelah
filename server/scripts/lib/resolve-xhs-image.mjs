/** RedNote CDN (rednotecdn.com) blocks hotlinking; xhscdn.com mirrors often still work. */

const XHS_IMG_HOSTS = [
  'https://sns-img-bd.xhscdn.com',
  'https://sns-img-qc.xhscdn.com',
]

export function extractXhsFileId(url) {
  if (!url) return null
  const match = String(url).match(/\/(1040g[^/!\?]+)/i)
  return match ? match[1] : null
}

/** Resolve a post cover URL to one the browser/server can fetch. */
export function resolveXhsImageUrl(imageUrl, { videoUrl } = {}) {
  if (!imageUrl && !videoUrl) return null

  if (imageUrl && !/rednotecdn\.com/i.test(imageUrl)) {
    return imageUrl
  }

  const fileId = extractXhsFileId(imageUrl) || extractXhsFileId(videoUrl)
  if (fileId) {
    return `${XHS_IMG_HOSTS[0]}/${fileId}`
  }

  if (videoUrl && /xhscdn\.com/i.test(videoUrl)) {
    return videoUrl
  }

  return imageUrl || null
}

export async function fetchXhsImage(imageUrl, options = {}) {
  const resolved = resolveXhsImageUrl(imageUrl, options)
  if (!resolved) return null

  const headers = {
    Referer: 'https://www.xiaohongshu.com/',
    Origin: 'https://www.xiaohongshu.com',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  }

  const fileId = extractXhsFileId(imageUrl) || extractXhsFileId(videoUrl)
  const candidates = fileId
    ? XHS_IMG_HOSTS.map((host) => `${host}/${fileId}`)
    : [resolved]

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow' })
      if (res.ok && (res.headers.get('content-type') || '').startsWith('image/')) {
        return { res, url }
      }
    } catch {
      // try next host
    }
  }

  return null
}
