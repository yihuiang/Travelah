import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getAuthToken } from '../context/AuthContext.jsx'

export default function JoinTripPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { t } = useLanguage()

  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState('loading') // loading | preview | joining | error
  const [errorMsg, setErrorMsg] = useState('')

  // Step 1: always fetch trip preview (public endpoint)
  useEffect(() => {
    if (!code) { setStatus('error'); setErrorMsg('Invalid invite link.'); return }

    fetch(`/api/invite/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setStatus('error'); setErrorMsg(data.error); return }
        setPreview(data)
        setStatus('preview')
      })
      .catch(() => { setStatus('error'); setErrorMsg('Failed to load invite info.') })
  }, [code])

  // Step 2: if user is already logged in, auto-join
  useEffect(() => {
    if (status !== 'preview' || !isAuthenticated) return
    handleJoin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isAuthenticated])

  async function handleJoin() {
    setStatus('joining')
    const token = getAuthToken()
    try {
      const res = await fetch(`/api/invite/${code}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.error) { setStatus('error'); setErrorMsg(data.error); return }
      navigate(`/itinerary/trip/${data.tripId}`, { replace: true })
    } catch {
      setStatus('error')
      setErrorMsg('Failed to join trip. Please try again.')
    }
  }

  function goToAuth(path) {
    // After auth, we want to come back to /join/:code so the join fires again
    navigate(path, {
      state: {
        from: { pathname: `/join/${code}` },
        background: { pathname: `/join/${code}` },
      },
    })
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.logo}>travelah</p>

        {(status === 'loading' || status === 'joining') && (
          <div style={styles.center}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#c0613a', animation: 'spin 1s linear infinite' }}>
              hourglass_empty
            </span>
            <p style={styles.label}>
              {status === 'joining' ? t('Joining trip…') : t('Loading…')}
            </p>
          </div>
        )}

        {status === 'error' && (
          <div style={styles.center}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#c0613a' }}>link_off</span>
            <p style={styles.errorTitle}>{t('Invite link expired or invalid')}</p>
            <p style={styles.label}>{errorMsg}</p>
            <button style={styles.btn} onClick={() => navigate('/')}>
              {t('Go to homepage')}
            </button>
          </div>
        )}

        {status === 'preview' && preview && !isAuthenticated && (
          <>
            <div style={styles.tripPreview}>
              {preview.image && (
                <img src={preview.image} alt={preview.title} style={styles.tripImg} />
              )}
              <div style={styles.tripInfo}>
                <p style={styles.tripLabel}>{t("You've been invited to join")}</p>
                <h1 style={styles.tripTitle}>{preview.title}</h1>
                <p style={styles.tripMeta}>
                  {preview.location}
                  {preview.memberCount > 1 && ` · ${preview.memberCount} ${t('members')}`}
                </p>
              </div>
            </div>

            <div style={styles.authPrompt}>
              <p style={styles.label}>{t('Sign in or create an account to join this trip.')}</p>
              <button style={styles.btn} onClick={() => goToAuth('/register')}>
                {t('Create account')}
              </button>
              <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => goToAuth('/login')}>
                {t('Sign in')}
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#faf8f5',
    padding: '24px',
  },
  card: {
    background: '#fff',
    borderRadius: '20px',
    padding: '40px 36px',
    maxWidth: '420px',
    width: '100%',
    boxShadow: '0 4px 40px rgba(0,0,0,0.10)',
    textAlign: 'center',
  },
  logo: {
    fontFamily: 'Georgia, serif',
    fontStyle: 'italic',
    fontSize: '22px',
    color: '#c0613a',
    marginBottom: '28px',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  tripPreview: {
    marginBottom: '24px',
  },
  tripImg: {
    width: '100%',
    height: '160px',
    objectFit: 'cover',
    borderRadius: '12px',
    marginBottom: '16px',
  },
  tripInfo: {
    textAlign: 'left',
  },
  tripLabel: {
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#888',
    marginBottom: '4px',
  },
  tripTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#1a1a18',
    margin: '0 0 6px',
  },
  tripMeta: {
    fontSize: '14px',
    color: '#666',
  },
  authPrompt: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  label: {
    fontSize: '14px',
    color: '#555',
    margin: '0 0 8px',
  },
  errorTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a18',
    margin: 0,
  },
  btn: {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    background: '#c0613a',
    color: '#fff',
    fontWeight: '600',
    fontSize: '15px',
    cursor: 'pointer',
  },
  btnSecondary: {
    background: '#f5f3ef',
    color: '#333',
  },
}
