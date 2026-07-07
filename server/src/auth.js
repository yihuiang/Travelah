import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const SECRET = process.env.JWT_SECRET || 'travelah-dev-secret-change-in-production'

export function signToken({ userId, username }) {
  return jwt.sign({ userId, username }, SECRET, { expiresIn: '7d' })
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET)
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Authorization required' })
  }
  try {
    req.auth = verifyToken(token)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Attaches req.auth when a valid token is present, but allows the request
// through as a guest otherwise. Used by endpoints that work for everyone but
// behave differently (e.g. persist data) for signed-in users.
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (token) {
    try {
      req.auth = verifyToken(token)
    } catch {
      // Invalid/expired token — treat as guest rather than rejecting.
    }
  }
  next()
}
