/** Public SPA origin for invite links, password reset emails, etc. */
export function getClientOrigin(req) {
  const configured = process.env.CLIENT_URL?.trim().replace(/\/$/, '')
  if (configured) return configured

  const origin = req?.headers?.origin?.trim()
  if (origin) return origin.replace(/\/$/, '')

  const port = process.env.CLIENT_PORT || '3000'
  return `http://localhost:${port}`
}
