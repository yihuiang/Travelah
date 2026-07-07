import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolvePublicAssetUrl } from './resolvePublicAsset.js'
import { deleteR2Object, isR2Configured, putR2Object } from './r2Storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const AVATARS_DIR = path.resolve(__dirname, '../../client/public/avatars')

const AVATAR_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

export function ensureAvatarsDir() {
  fs.mkdirSync(AVATARS_DIR, { recursive: true })
}

export function extFromMime(mimetype) {
  if (mimetype === 'image/png') return '.png'
  if (mimetype === 'image/webp') return '.webp'
  if (mimetype === 'image/gif') return '.gif'
  return '.jpg'
}

function avatarObjectKey(userId, ext) {
  return `avatars/${userId}${ext}`
}

function removeLocalUserAvatars(userId) {
  for (const ext of AVATAR_EXTENSIONS) {
    const filePath = path.join(AVATARS_DIR, `${userId}${ext}`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}

async function removeR2UserAvatars(userId) {
  await Promise.all(AVATAR_EXTENSIONS.map((ext) => deleteR2Object(avatarObjectKey(userId, ext))))
}

export async function removeUserAvatars(userId) {
  removeLocalUserAvatars(userId)
  if (isR2Configured()) {
    await removeR2UserAvatars(userId)
  }
}

export function avatarPublicUrl(userId, ext) {
  return `/avatars/${userId}${ext}?v=${Date.now()}`
}

/** Resolve stored avatar path for API responses (R2 CDN when configured). */
export function presentAvatarUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null
  if (/^https?:\/\//i.test(url)) {
    return url.includes('/avatars/') ? url : null
  }
  if (!url.startsWith('/avatars/')) return null
  if (isR2Configured() && process.env.R2_PUBLIC_URL) {
    return resolvePublicAssetUrl(url)
  }
  return url
}

export function isAllowedImage(mimetype) {
  return /^image\/(jpeg|png|webp|gif)$/i.test(mimetype || '')
}

export async function saveUserAvatar(userId, buffer, mimetype) {
  const ext = extFromMime(mimetype)
  await removeUserAvatars(userId)

  if (isR2Configured()) {
    await putR2Object(avatarObjectKey(userId, ext), buffer, mimetype)
    return avatarPublicUrl(userId, ext)
  }

  ensureAvatarsDir()
  fs.writeFileSync(path.join(AVATARS_DIR, `${userId}${ext}`), buffer)
  return avatarPublicUrl(userId, ext)
}
