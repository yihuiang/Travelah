/** Prefix /images/, /posts/, /places/ paths with R2_PUBLIC_URL when configured. */
export function resolvePublicAssetUrl(path) {
  if (!path) return path
  if (/^https?:\/\//i.test(path)) return path

  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
  if (!base) return path

  const [pathname, query = ''] = String(path).split('?')
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname.replace(/^\/+/, '')}`

  const onR2 =
    normalized.startsWith('/images/') ||
    normalized.startsWith('/posts/') ||
    normalized.startsWith('/places/') ||
    normalized.startsWith('/avatars/')

  if (!onR2) return path

  const remote = `${base}${encodeURI(normalized)}`
  return query ? `${remote}?${query}` : remote
}
