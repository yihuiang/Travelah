import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchXhsImage } from './resolve-xhs-image.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const POSTS_PUBLIC_DIR = path.resolve(__dirname, '../../../client/public/posts')

const IG_FETCH_HEADERS = {
  Referer: 'https://www.instagram.com/',
  Origin: 'https://www.instagram.com',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
}

async function fetchInstagramImage(imageUrl) {
  if (!imageUrl || !/fbcdn\.net|cdninstagram\.com/i.test(imageUrl)) return null
  try {
    const res = await fetch(imageUrl, { headers: IG_FETCH_HEADERS, redirect: 'follow' })
    const type = res.headers.get('content-type') || ''
    if (res.ok && type.startsWith('image/')) {
      return { res, url: imageUrl }
    }
  } catch {
    // fall through
  }
  return null
}

async function fetchPostImage(imageUrl, options = {}) {
  const xhs = await fetchXhsImage(imageUrl, options)
  if (xhs) return xhs
  return fetchInstagramImage(imageUrl)
}

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
    const fetched = await fetchPostImage(imageUrl, { videoUrl })
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

/** Stream a remote post image (used when local cache is unavailable). */
export async function streamPostImage(imageUrl, { videoUrl } = {}) {
  const fetched = await fetchPostImage(imageUrl, { videoUrl })
  if (!fetched) return null

  const contentType = fetched.res.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/')) return null

  const buffer = Buffer.from(await fetched.res.arrayBuffer())
  if (buffer.length < 500) return null

  return { buffer, contentType }
}
