import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'

const GoogleAuthContext = createContext({ enabled: false, ready: false })

export function useGoogleAuthReady() {
  return useContext(GoogleAuthContext)
}

export default function GoogleAuthBridge({ children }) {
  const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || ''
  const [clientId, setClientId] = useState(envClientId)
  const [ready, setReady] = useState(Boolean(envClientId))

  useEffect(() => {
    if (envClientId) return undefined

    let cancelled = false
    fetch('/api/auth/config')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (cancelled) return
        const id = data?.googleClientId?.trim()
        if (id) setClientId(id)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [envClientId])

  const contextValue = useMemo(
    () => ({ enabled: Boolean(clientId), ready: envClientId ? true : ready }),
    [clientId, envClientId, ready],
  )

  if (!contextValue.ready) {
    return <GoogleAuthContext.Provider value={contextValue}>{children}</GoogleAuthContext.Provider>
  }

  if (!clientId) {
    return <GoogleAuthContext.Provider value={contextValue}>{children}</GoogleAuthContext.Provider>
  }

  return (
    <GoogleAuthContext.Provider value={contextValue}>
      <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
    </GoogleAuthContext.Provider>
  )
}
