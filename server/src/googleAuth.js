import { OAuth2Client } from 'google-auth-library'

export function getGoogleOAuthClientId() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || ''
  return clientId.trim() || null
}

export function isGoogleAuthConfigured() {
  return Boolean(getGoogleOAuthClientId())
}

export async function verifyGoogleIdToken(credential) {
  const id = getGoogleOAuthClientId()
  if (!id) {
    const err = new Error('Google sign-in is not configured on the server')
    err.code = 'NOT_CONFIGURED'
    throw err
  }
  if (!credential?.trim()) {
    const err = new Error('Missing Google credential')
    err.code = 'VALIDATION'
    throw err
  }

  const client = new OAuth2Client(id)
  let payload
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential.trim(),
      audience: id,
    })
    payload = ticket.getPayload()
  } catch {
    const err = new Error('Invalid or expired Google sign-in. Please try again.')
    err.code = 'INVALID_TOKEN'
    throw err
  }

  if (!payload?.sub) {
    const err = new Error('Invalid Google token')
    err.code = 'INVALID_TOKEN'
    throw err
  }

  return {
    googleId: payload.sub,
    email: payload.email?.trim().toLowerCase() || null,
    emailVerified: payload.email_verified === true,
    displayName: payload.name?.trim() || payload.given_name?.trim() || null,
  }
}
