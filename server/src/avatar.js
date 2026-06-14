import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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

export function removeUserAvatars(userId) {
  for (const ext of AVATAR_EXTENSIONS) {
    const filePath = path.join(AVATARS_DIR, `${userId}${ext}`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}

export function avatarPublicUrl(userId, ext) {
  return `/avatars/${userId}${ext}?v=${Date.now()}`
}

export function isAllowedImage(mimetype) {
  return /^image\/(jpeg|png|webp|gif)$/i.test(mimetype || '')
}
