import { useCallback, useEffect, useRef, useState } from 'react'

export function useTimedToast(durationMs = 3500) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const showToast = useCallback(
    (payload) => {
      setToast(payload)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setToast(null), durationMs)
    },
    [durationMs],
  )

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return { toast, showToast }
}
