import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { settingsLanguageToCode, useLanguage } from './LanguageContext.jsx'

const TOKEN_KEY = 'travelah_token'
const USER_KEY = 'travelah_user'

const AuthContext = createContext(null)

function readStoredSession() {
  for (const storage of [localStorage, sessionStorage]) {
    const token = storage.getItem(TOKEN_KEY)?.trim()
    const rawUser = storage.getItem(USER_KEY)
    if (token && rawUser) {
      try {
        return { token, user: JSON.parse(rawUser), storage, remember: storage === localStorage }
      } catch {
        storage.removeItem(TOKEN_KEY)
        storage.removeItem(USER_KEY)
      }
    }
  }
  return { token: null, user: null, storage: null, remember: true }
}

function persistSession({ token, user, remember }) {
  const storage = remember ? localStorage : sessionStorage
  const other = remember ? sessionStorage : localStorage
  other.removeItem(TOKEN_KEY)
  other.removeItem(USER_KEY)
  storage.setItem(TOKEN_KEY, token)
  storage.setItem(USER_KEY, JSON.stringify(user))
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}

export function AuthProvider({ children }) {
  const initial = readStoredSession()
  const [token, setToken] = useState(initial.token)
  const [user, setUser] = useState(initial.user)
  const [sessionReady, setSessionReady] = useState(!initial.token)
  const { setLanguage } = useLanguage()

  useEffect(() => {
    if (!user?.settings?.language) return
    setLanguage(settingsLanguageToCode(user.settings.language))
  }, [user?.settings?.language, setLanguage])

  useEffect(() => {
    if (!initial.token) {
      setSessionReady(true)
      return undefined
    }

    let cancelled = false
    fetch('/api/profile/me', {
      headers: { Authorization: `Bearer ${initial.token}` },
    })
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 401) {
          clearSession()
          setToken(null)
          setUser(null)
          return
        }
        if (!res.ok) return
        const freshUser = await res.json().catch(() => null)
        if (!freshUser) return
        persistSession({
          token: initial.token,
          user: freshUser,
          remember: initial.remember,
        })
        setToken(initial.token)
        setUser(freshUser)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSessionReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (loginId, password, remember = true) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginId.trim(), password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || 'Login failed')
    }
    persistSession({ token: data.token, user: data.user, remember })
    setToken(data.token)
    setUser(data.user)
    setSessionReady(true)
    return data.user
  }, [])

  const loginWithGoogle = useCallback(async (credential, remember = true) => {
    let res
    try {
      res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, mode: 'login' }),
      })
    } catch {
      throw new Error('Could not reach the server. Make sure the API is running on port 5000.')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.error || 'Google sign-in failed')
      if (data.code) err.code = data.code
      if (data.googleEmail) err.googleEmail = data.googleEmail
      if (data.googleDisplayName) err.googleDisplayName = data.googleDisplayName
      throw err
    }
    persistSession({ token: data.token, user: data.user, remember })
    setToken(data.token)
    setUser(data.user)
    setSessionReady(true)
    return { user: data.user, isNewUser: Boolean(data.isNewUser) }
  }, [])

  const registerWithGoogle = useCallback(async (credential, remember = true) => {
    let res
    try {
      res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, mode: 'register' }),
      })
    } catch {
      throw new Error('Could not reach the server. Make sure the API is running on port 5000.')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.error || 'Google sign-up failed')
      if (data.code) err.code = data.code
      throw err
    }
    persistSession({ token: data.token, user: data.user, remember })
    setToken(data.token)
    setUser(data.user)
    setSessionReady(true)
    return { user: data.user, isNewUser: Boolean(data.isNewUser) }
  }, [])

  const register = useCallback(async (payload, remember = true) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed')
    }
    persistSession({ token: data.token, user: data.user, remember })
    setToken(data.token)
    setUser(data.user)
    setSessionReady(true)
    return data.user
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setToken(null)
    setUser(null)
    setSessionReady(true)
  }, [])

  const updatePreferences = useCallback(
    async (preferences, remember = true) => {
      const currentToken = token || getAuthToken()
      if (!currentToken) throw new Error('Not signed in')

      const res = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ preferences }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Could not save preferences')
      }
      persistSession({ token: currentToken, user: data, remember })
      setUser(data)
      return data
    },
    [token],
  )

  const updateSettings = useCallback(
    async (settings, remember = true) => {
      const currentToken = token || getAuthToken()
      if (!currentToken) throw new Error('Not signed in')

      const res = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ settings }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Could not save settings')
      }
      persistSession({ token: currentToken, user: data, remember })
      setUser(data)
      return data
    },
    [token],
  )

  const syncUserSession = useCallback(
    (nextUser, remember = true) => {
      const currentToken = token || getAuthToken()
      if (!currentToken) return
      persistSession({ token: currentToken, user: nextUser, remember })
      setUser(nextUser)
    },
    [token],
  )

  const uploadAvatar = useCallback(
    async (file, remember = true) => {
      const currentToken = token || getAuthToken()
      if (!currentToken) throw new Error('Not signed in')
      if (!file) throw new Error('No file selected')

      const form = new FormData()
      form.append('avatar', file)

      const res = await fetch('/api/profile/me/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Could not upload photo')
      }
      persistSession({ token: currentToken, user: data, remember })
      setUser(data)
      return data
    },
    [token],
  )

  const removeAvatar = useCallback(
    async (remember = true) => {
      const currentToken = token || getAuthToken()
      if (!currentToken) throw new Error('Not signed in')

      const res = await fetch('/api/profile/me/avatar', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${currentToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Could not remove photo')
      }
      persistSession({ token: currentToken, user: data, remember })
      setUser(data)
      return data
    },
    [token],
  )

  const updateProfile = useCallback(
    async ({ displayName, email, currentPassword, newPassword }, remember = true) => {
      const currentToken = token || getAuthToken()
      if (!currentToken) throw new Error('Not signed in')

      const body = {}
      if (displayName !== undefined) body.displayName = displayName
      if (email !== undefined) body.email = email
      if (newPassword) {
        body.currentPassword = currentPassword
        body.newPassword = newPassword
      }

      const res = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Could not update profile')
      }
      persistSession({ token: currentToken, user: data, remember })
      setUser(data)
      return data
    },
    [token],
  )

  const deleteAccount = useCallback(async () => {
    const currentToken = token || getAuthToken()
    if (!currentToken) throw new Error('Not signed in')

    const res = await fetch('/api/profile/me', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${currentToken}` },
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Could not delete account')
    }

    clearSession()
    setToken(null)
    setUser(null)
    setSessionReady(true)
  }, [token])

  const toggleSavedPlace = useCallback(
    async (placeId, shouldSave, remember = true) => {
      const currentToken = token || getAuthToken()
      if (!currentToken) throw new Error('Not signed in')

      const res = await fetch(`/api/profile/me/saved-places/${encodeURIComponent(placeId)}`, {
        method: shouldSave ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${currentToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Could not update saved place')
      }
      persistSession({ token: currentToken, user: data, remember })
      setUser(data)
      return data
    },
    [token],
  )

  const value = useMemo(
    () => ({
      user,
      token,
      sessionReady,
      isAuthenticated: Boolean(token),
      login,
      loginWithGoogle,
      registerWithGoogle,
      register,
      logout,
      updatePreferences,
      updateProfile,
      updateSettings,
      uploadAvatar,
      removeAvatar,
      deleteAccount,
      syncUserSession,
      toggleSavedPlace,
    }),
    [user, token, sessionReady, login, loginWithGoogle, registerWithGoogle, register, logout, updatePreferences, updateProfile, updateSettings, uploadAvatar, removeAvatar, deleteAccount, syncUserSession, toggleSavedPlace],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function getAuthToken() {
  const stored = readStoredSession()
  return stored.token || null
}
