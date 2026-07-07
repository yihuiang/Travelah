const REMEMBER_LOGIN_KEY = 'travelah_remember_login'
const REMEMBER_EMAIL_KEY = 'travelah_remember_email'

export function readRememberedLogin() {
  try {
    const stored = localStorage.getItem(REMEMBER_LOGIN_KEY)
    if (stored === null) {
      return { remember: true, email: '' }
    }
    const remember = stored === '1'
    const email = remember ? localStorage.getItem(REMEMBER_EMAIL_KEY) || '' : ''
    return { remember, email }
  } catch {
    return { remember: true, email: '' }
  }
}

export function persistRememberedLogin({ remember, email }) {
  try {
    const trimmed = email?.trim() || ''
    if (remember && trimmed) {
      localStorage.setItem(REMEMBER_LOGIN_KEY, '1')
      localStorage.setItem(REMEMBER_EMAIL_KEY, trimmed)
      return
    }
    localStorage.removeItem(REMEMBER_LOGIN_KEY)
    localStorage.removeItem(REMEMBER_EMAIL_KEY)
  } catch {
    // ignore storage errors (private browsing, quota, etc.)
  }
}
