import { useEffect, useRef } from 'react'
import { useChat } from '../../context/ChatContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import '../../styles/concierge.css'

// Example prompts shown in the empty state. English source — t() localizes them.
const AI_EXAMPLES = [
  '5 days in Penang, street food & heritage',
  'Sabah hiking trip, not a resort person',
  'Weekend in Kuala Lumpur on a budget',
]

function formatConvoDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

// Shared chat thread: toolbar + (message list | history list) + input. All
// state lives in ChatContext, so the homepage section and floating widget mirror
// each other.
export default function ConciergeThread() {
  const { t } = useLanguage()
  const {
    messages,
    input,
    setInput,
    loading,
    send,
    openPlan,
    view,
    conversations,
    isAuthenticated,
    newConversation,
    openConversation,
    deleteConversation,
    showHistory,
    showChat,
  } = useChat()
  const scrollRef = useRef(null)

  useEffect(() => {
    if (view !== 'chat') return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading, view])

  function onSubmit(e) {
    e.preventDefault()
    send(input)
  }

  return (
    <>
      <div className="ai-chat-bar">
        <button type="button" className="ai-chat-bar-btn" onClick={newConversation}>
          <span className="material-symbols-outlined">add</span>
          {t('New chat')}
        </button>
        <button
          type="button"
          className={`ai-chat-bar-btn${view === 'history' ? ' is-active' : ''}`}
          onClick={view === 'history' ? showChat : showHistory}
        >
          <span className="material-symbols-outlined">{view === 'history' ? 'arrow_back' : 'history'}</span>
          {view === 'history' ? t('Back') : t('History')}
        </button>
      </div>

      {view === 'history' ? (
        <div className="ai-chat-scroll">
          {!isAuthenticated ? (
            <div className="ai-chat-empty">
              <span className="material-symbols-outlined ai-chat-empty-icon">lock</span>
              <p className="ai-chat-empty-title">{t('Sign in to save chats')}</p>
              <p className="ai-chat-empty-sub">
                {t('Your past conversations are saved to your account when you sign in.')}
              </p>
            </div>
          ) : conversations.length === 0 ? (
            <div className="ai-chat-empty">
              <span className="material-symbols-outlined ai-chat-empty-icon">forum</span>
              <p className="ai-chat-empty-title">{t('No saved chats yet')}</p>
              <p className="ai-chat-empty-sub">{t('Start planning and your conversations will appear here.')}</p>
            </div>
          ) : (
            <ul className="ai-convo-list">
              {conversations.map((c) => (
                <li key={c.id} className="ai-convo-item">
                  <button type="button" className="ai-convo-open" onClick={() => openConversation(c.id)}>
                    <span className="ai-convo-title">{c.title}</span>
                    <span className="ai-convo-date">{formatConvoDate(c.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="ai-convo-del"
                    onClick={() => deleteConversation(c.id)}
                    aria-label={t('Delete chat')}
                    title={t('Delete chat')}
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="ai-chat-scroll" ref={scrollRef}>
          {messages.length === 0 && !loading && (
            <div className="ai-chat-empty">
              <span className="material-symbols-outlined ai-chat-empty-icon">auto_awesome</span>
              <p className="ai-chat-empty-title">{t('Tell me about your trip')}</p>
              <p className="ai-chat-empty-sub">
                {t("Any language — I'll build a real Malaysia itinerary from local posts.")}
              </p>
              <div className="ai-chat-examples">
                {AI_EXAMPLES.map((ex) => (
                  <button key={ex} type="button" className="ai-chat-example" onClick={() => send(t(ex))}>
                    {t(ex)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`ai-msg ${m.role}`}>
              {m.role === 'ai' && <span className="ai-msg-avatar">t</span>}
              <div className="ai-msg-bubble">
                <span className="ai-msg-text">{m.text}</span>
                {m.plan && (
                  <div className="ai-itin-card">
                    <div className="ai-itin-head">
                      <span className="material-symbols-outlined">map</span>
                      <span>
                        {m.plan.destination}
                        {' · '}
                        {m.plan.dayCount} {t('day plan')}
                      </span>
                    </div>
                    {Array.isArray(m.plan.stops) && m.plan.stops.length > 0 && (
                      <ul className="ai-itin-stops">
                        {m.plan.stops.map((s, idx) => (
                          <li key={idx}>
                            <span className="material-symbols-outlined">{s.icon || 'place'}</span>
                            {s.name}
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="button" className="ai-itin-btn" onClick={() => openPlan(m.plan)}>
                      {t('View full itinerary')}
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        east
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="ai-msg ai">
              <span className="ai-msg-avatar">t</span>
              <div className="ai-msg-bubble">
                <div className="ai-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {view !== 'history' && (
        <form className="ai-chat-input" onSubmit={onSubmit}>
          <input
            type="text"
            placeholder={t('Describe your trip in any language…')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            disabled={loading}
          />
          <button
            type="submit"
            className="chat-send"
            disabled={loading || !input.trim()}
            aria-label={t('Send')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              arrow_upward
            </span>
          </button>
        </form>
      )}
    </>
  )
}
