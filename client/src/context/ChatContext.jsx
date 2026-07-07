import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, getAuthToken } from './AuthContext.jsx'
import { useLanguage } from './LanguageContext.jsx'

const ChatContext = createContext(null)

// Shared concierge state used by both the homepage section and the floating
// widget. Signed-in users get multiple saved conversations (DB-backed) with a
// fresh chat each login and a history list; guests are single-chat, in-memory.
export function ChatProvider({ children }) {
  const navigate = useNavigate()
  const { isAuthenticated, sessionReady, token } = useAuth()
  const { t } = useLanguage()

  const [messages, setMessages] = useState([]) // active conversation: { role, text, plan? }
  const [conversationId, setConversationId] = useState(null) // null = new, unsaved
  const [conversations, setConversations] = useState([]) // history list: { id, title, updatedAt }
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('chat') // 'chat' | 'history'

  const initedRef = useRef(false)
  const authHeader = useCallback(() => {
    const tk = token || getAuthToken()
    return tk ? { Authorization: `Bearer ${tk}` } : null
  }, [token])

  const refreshConversations = useCallback(async () => {
    const headers = authHeader()
    if (!headers) return
    try {
      const res = await fetch('/api/concierge/conversations', { headers })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.conversations)) setConversations(data.conversations)
    } catch {
      /* ignore */
    }
  }, [authHeader])

  const newConversation = useCallback(() => {
    setConversationId(null)
    setMessages([])
    setView('chat')
  }, [])

  // Fresh conversation on login; reset everything on logout.
  useEffect(() => {
    if (!sessionReady) return
    if (!isAuthenticated) {
      initedRef.current = false
      setConversationId(null)
      setMessages([])
      setConversations([])
      setView('chat')
      return
    }
    if (initedRef.current) return
    initedRef.current = true
    setConversationId(null)
    setMessages([])
    setView('chat')
    refreshConversations()
  }, [sessionReady, isAuthenticated, refreshConversations])

  const send = useCallback(
    async (text) => {
      const trimmed = (text || '').trim()
      if (!trimmed || loading) return
      const priorHistory = messages.map((m) => ({
        role: m.role === 'ai' ? 'model' : 'user',
        text: m.text,
      }))
      setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
      setInput('')
      setView('chat')
      setLoading(true)
      try {
        const headers = { 'Content-Type': 'application/json', ...(authHeader() || {}) }
        const res = await fetch('/api/concierge', {
          method: 'POST',
          headers,
          body: JSON.stringify({ message: trimmed, history: priorHistory, conversationId }),
        })
        const data = await res.json().catch(() => ({}))
        const aiText = data.rateLimited
          ? t("I've reached today's free AI limit 😅 Please try again tomorrow — your free quota resets daily.")
          : data.reply || t('Sorry, I had trouble responding. Please try again.')
        setMessages((prev) => [...prev, { role: 'ai', text: aiText, plan: data.plan || null }])
        if (data.conversationId && data.conversationId !== conversationId) {
          setConversationId(data.conversationId)
          refreshConversations()
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'ai', text: t('Sorry, I had trouble responding. Please try again.') },
        ])
      } finally {
        setLoading(false)
      }
    },
    [messages, loading, conversationId, authHeader, refreshConversations, t],
  )

  const openConversation = useCallback(
    async (id) => {
      const headers = authHeader()
      if (!headers) return
      setView('chat')
      try {
        const res = await fetch(`/api/concierge/conversations/${encodeURIComponent(id)}`, { headers })
        const data = await res.json().catch(() => ({}))
        if (Array.isArray(data.messages)) {
          setMessages(data.messages)
          setConversationId(id)
        }
      } catch {
        /* ignore */
      }
    },
    [authHeader],
  )

  const deleteConversation = useCallback(
    async (id) => {
      const headers = authHeader()
      if (!headers) return
      try {
        await fetch(`/api/concierge/conversations/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers,
        })
      } catch {
        /* ignore */
      }
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (id === conversationId) newConversation()
    },
    [authHeader, conversationId, newConversation],
  )

  // Open the full itinerary for a plan card (regenerated from saved params).
  const openPlan = useCallback(
    (plan) => {
      if (!plan) return
      const p = plan.params || {}
      navigate('/itinerary', {
        state: {
          destinations: p.destinations || [],
          vibes: p.vibes || [],
          pace: p.pace || 'balanced',
          budget: p.budget || 'mid',
          title: (p.destinations || []).join(' → ') || plan.destination || 'My trip',
          fromConcierge: true,
          autoSave: isAuthenticated,
        },
      })
      setOpen(false)
    },
    [navigate, isAuthenticated],
  )

  const showHistory = useCallback(() => {
    setView('history')
    refreshConversations()
  }, [refreshConversations])

  const value = useMemo(
    () => ({
      messages,
      input,
      setInput,
      loading,
      send,
      openPlan,
      open,
      view,
      conversations,
      conversationId,
      isAuthenticated,
      newConversation,
      openConversation,
      deleteConversation,
      showHistory,
      showChat: () => setView('chat'),
      openWidget: () => setOpen(true),
      closeWidget: () => setOpen(false),
      toggleWidget: () => setOpen((o) => !o),
    }),
    [
      messages,
      input,
      loading,
      send,
      openPlan,
      open,
      view,
      conversations,
      conversationId,
      isAuthenticated,
      newConversation,
      openConversation,
      deleteConversation,
      showHistory,
    ],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
