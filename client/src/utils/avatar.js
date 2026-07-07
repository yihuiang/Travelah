/** Only show avatars uploaded through Travelah, not Google or other external URLs. */
export function resolveAvatarUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null

  if (/^https?:\/\//i.test(url)) {
    return url.includes('/avatars/') ? url : null
  }

  if (!url.startsWith('/avatars/')) return null
  return url
}

export function profileInitial(user) {
  const raw = user?.displayName || user?.username || user?.email || '?'
  return raw.charAt(0).toUpperCase()
}
