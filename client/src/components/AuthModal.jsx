import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import '../styles/auth-v2.css'

export const AUTH_HERO_IMAGE =
  'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?auto=format&fit=crop&w=900&q=80'

export default function AuthModal({ children, variant = 'signin' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()
  const background = location.state?.background

  const closeModal = useCallback(() => {
    if (background) {
      navigate(background.pathname + (background.search || ''), { replace: true })
      return
    }
    navigate('/', { replace: true })
  }, [background, navigate])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeModal])

  return (
    <div className="auth-v2" role="dialog" aria-modal="true">
      <div className="auth-overlay">
        <div className={`auth-card${variant === 'signup' ? ' auth-card--signup' : ''}`}>
          <button type="button" className="btn-close" onClick={closeModal} aria-label="Close">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              close
            </span>
          </button>

          <div className="auth-form-panel">
            <div className="auth-form-inner">{children}</div>
          </div>

          <div className="auth-hero-panel">
            <img src={AUTH_HERO_IMAGE} alt="George Town, Penang" />
            <div className="auth-hero-overlay" />

            <div className="hero-stats">
              <div className="hero-stat">
                <p className="hero-stat-val">12.5K+</p>
                <p className="hero-stat-label">{t('Local posts indexed')}</p>
              </div>
              <div className="hero-stat">
                <p className="hero-stat-val">13</p>
                <p className="hero-stat-label">{t('Malaysian states')}</p>
              </div>
              <div className="hero-stat">
                <p className="hero-stat-val">3</p>
                <p className="hero-stat-label">{t('Federal territories')}</p>
              </div>
            </div>

            <div className="auth-hero-content">
              <span className="hero-badge">
                <span className="material-symbols-outlined">auto_awesome</span> {t('AI Concierge')}
              </span>
              <p className="hero-quote">
                &ldquo;{t('See Malaysia the way locals do — guided by thousands of real voices, not tourist brochures.')}&rdquo;
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
