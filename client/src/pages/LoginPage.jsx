import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthModal from '../components/AuthModal.jsx'
import SocialAuthButtons from '../components/SocialAuthButtons.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { needsOnboarding } from '../utils/preferenceSuggestions.js'
import { persistRememberedLogin, readRememberedLogin } from '../utils/rememberLogin.js'

const rememberedLogin = readRememberedLogin()

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, loginWithGoogle } = useAuth()
  const { t } = useLanguage()

  const [email, setEmail] = useState(rememberedLogin.email)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(rememberedLogin.remember)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const modalState = { background: location.state?.background, from: location.state?.from }

  function goAfterAuth(user) {
    if (needsOnboarding(user)) {
      navigate('/register', {
        replace: true,
        state: { ...modalState, onboarding: true },
      })
      return
    }
    navigate('/', { replace: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('Please fill in all fields.')
      return
    }

    setSubmitting(true)
    try {
      const trimmedEmail = email.trim()
      const user = await login(trimmedEmail, password, remember)
      persistRememberedLogin({ remember, email: trimmedEmail })
      goAfterAuth(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogleSuccess(credential) {
    setError(null)
    setGoogleSubmitting(true)
    try {
      const { user } = await loginWithGoogle(credential, remember)
      persistRememberedLogin({ remember, email: user?.email || email.trim() })
      goAfterAuth(user)
    } catch (err) {
      if (err.code === 'ACCOUNT_NOT_FOUND' && err.googleEmail) {
        navigate('/register', {
          replace: true,
          state: {
            ...modalState,
            googleSignup: {
              email: err.googleEmail,
              displayName: err.googleDisplayName || '',
            },
          },
        })
        return
      }
      setError(err.message)
    } finally {
      setGoogleSubmitting(false)
    }
  }

  return (
    <AuthModal>
      <div className="auth-view-signin">
      <p className="auth-logo">travelah</p>
      <div className="auth-eyebrow">
        <div className="auth-eyebrow-dot" />
        <span className="auth-eyebrow-text">{t('Welcome back')}</span>
      </div>
      <h1 className="auth-title">
        {t('Sign in to')} <em>{t('continue.')}</em>
      </h1>
      <p className="auth-subtitle">{t('Pick up your itineraries right where you left off.')}</p>

      {error && (
        <p className="form-error show" role="alert">
          <span className="material-symbols-outlined">error</span>
          <span>{error}</span>
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label" htmlFor="signin-email">
            {t('Email')}
          </label>
          <input
            className="field-input"
            type="email"
            id="signin-email"
            name="email"
            placeholder="you@example.com"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="signin-pw">
            {t('Password')}
          </label>
          <div className="password-wrap">
            <input
              className="field-input"
              type={showPassword ? 'text' : 'password'}
              id="signin-pw"
              name="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="btn-toggle-pw"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t('Hide password') : t('Show password')}
            >
              <span className="material-symbols-outlined">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        <div className="form-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              id="remember-me"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            {t('Remember me')}
          </label>
          <Link to="/forgot-password" state={modalState} className="link-rust">
            {t('Forgot password?')}
          </Link>
        </div>

        <button
          type="submit"
          className={`btn-primary${submitting ? ' loading' : ''}`}
          disabled={submitting}
        >
          <span className="spinner" aria-hidden="true" />
          <span className="btn-label">{submitting ? t('Signing in…') : t('Sign in')}</span>
        </button>
      </form>

      <div className="divider">
        <div className="divider-line" />
        <span className="divider-text">{t('or continue with')}</span>
        <div className="divider-line" />
      </div>

      <SocialAuthButtons
        compact
        disabled={submitting || googleSubmitting}
        onGoogleSuccess={handleGoogleSuccess}
        onGoogleError={setError}
      />

      <Link to="/explore" className="btn-guest" replace>
        {t('Continue as guest')} <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
      </Link>

      <p className="auth-switch">
        {t('New to TravelAh?')}{' '}
        <Link to="/register" state={modalState} replace>
          {t('Create an account')}
        </Link>
      </p>
      </div>
    </AuthModal>
  )
}
