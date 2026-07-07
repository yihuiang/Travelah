import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import AuthModal from '../components/AuthModal.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function ResetPasswordPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()
  const modalState = { background: location.state?.background, from: location.state?.from }

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!password || password.length < 8) {
      setError(t('Password must be at least 8 characters.'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('Passwords do not match.'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not reset password')

      setSuccess(true)
      window.setTimeout(() => {
        navigate('/login', { replace: true, state: modalState })
      }, 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <AuthModal>
        <div className="auth-view-signin">
          <p className="form-error show">{t('Invalid reset link.')}</p>
          <Link to="/forgot-password" state={modalState} className="link-rust">
            {t('Request a new link')}
          </Link>
        </div>
      </AuthModal>
    )
  }

  return (
    <AuthModal>
      <div className="auth-view-signin">
        <p className="auth-logo">travelah</p>
        <div className="auth-eyebrow">
          <div className="auth-eyebrow-dot" />
          <span className="auth-eyebrow-text">{t('Account recovery')}</span>
        </div>
        <h1 className="auth-title">
          {t('Choose a new')} <em>{t('password.')}</em>
        </h1>

        {error && (
          <p className="form-error show" role="alert">
            <span className="material-symbols-outlined">error</span>
            <span>{error}</span>
          </p>
        )}

        {success ? (
          <div className="form-success show" role="status">
            <span className="material-symbols-outlined">check_circle</span>
            <span>{t('Password updated. Redirecting to sign in…')}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label className="field-label" htmlFor="reset-pw">
                {t('New password')}
              </label>
              <div className="password-wrap">
                <input
                  className="field-input"
                  type={showPassword ? 'text' : 'password'}
                  id="reset-pw"
                  name="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  minLength={8}
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

            <div className="field-group">
              <label className="field-label" htmlFor="reset-pw-confirm">
                {t('Confirm password')}
              </label>
              <input
                className="field-input"
                type={showPassword ? 'text' : 'password'}
                id="reset-pw-confirm"
                name="confirmPassword"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className={`btn-primary${submitting ? ' loading' : ''}`}
              disabled={submitting}
            >
              <span className="spinner" aria-hidden="true" />
              <span className="btn-label">{submitting ? t('Updating…') : t('Update password')}</span>
            </button>
          </form>
        )}

        <p className="auth-switch" style={{ marginTop: 24 }}>
          <Link to="/login" state={modalState} replace>
            {t('Back to sign in')}
          </Link>
        </p>
      </div>
    </AuthModal>
  )
}
