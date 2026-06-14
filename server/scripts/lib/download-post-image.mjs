import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchXhsImage } from './resolve-xhs-image.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const POSTS_PUBLIC_DIR = path.resolve(__dirname, '../../../client/public/posts')

const FETCH_HEADERS = {
  Referer: 'https://www.xiaohongshu.com/',
  Origin: 'https://www.xiaohongshu.com',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
}

// kept for any legacy callers
export { FETCH_HEADERS }

function extFromContentType(type) {
  if (!type) return '.jpg'
  if (type.includes('webp')) return '.webp'
  if (type.includes('png')) return '.png'
  if (type.includes('gif')) return '.gif'
  return '.jpg'
}

export function localPostImagePath(postId) {
  if (!postId || !fs.existsSync(POSTS_PUBLIC_DIR)) return null
  for (const ext of ['.webp', '.jpg', '.jpeg', '.png']) {
    const file = path.join(POSTS_PUBLIC_DIR, `${postId}${ext}`)
    if (fs.existsSync(file)) return `/posts/${postId}${ext}`
  }
  return null
}

export async function downloadPostImage(postId, imageUrl, { videoUrl } = {}) {
  if (!postId || (!imageUrl && !videoUrl)) return null

  const existing = localPostImagePath(postId)
  if (existing) return existing

  fs.mkdirSync(POSTS_PUBLIC_DIR, { recursive: true })

  try {
    const fetched = await fetchXhsImage(imageUrl, { videoUrl })
    if (!fetched) return null

    const { res } = fetched

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return null

    const ext = extFromContentType(contentType)
    const filePath = path.join(POSTS_PUBLIC_DIR, `${postId}${ext}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 500) return null

    fs.writeFileSync(filePath, buffer)
    return `/posts/${postId}${ext}`
  } catch {
    return null
  }
}

export async function downloadPostsImages(posts, { delayMs = 120, onProgress } = {}) {
  let saved = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    const id = post.id || post.postId
    if (!id || !post.image) {
      skipped += 1
      continue
    }

    if (post.imageLocal || localPostImagePath(id)) {
      skipped += 1
      continue
    }

    const local = await downloadPostImage(id, post.image, { videoUrl: post.videoUrl })
    if (local) {
      post.imageLocal = local
      saved += 1
    } else {
      failed += 1
    }

    if (onProgress && (i + 1) % 25 === 0) {
      onProgress({ done: i + 1, total: posts.length, saved, failed, skipped })
    }

    if (delayMs > 0 && i < posts.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  return { saved, failed, skipped }
}
