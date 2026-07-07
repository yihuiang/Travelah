import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthModal from '../components/AuthModal.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

function resetPathFromLink(resetLink) {
  try {
    return new URL(resetLink).pathname
  } catch {
    const match = String(resetLink).match(/\/reset-password\/[^/?#]+/)
    return match ? match[0] : null
  }
}

export default function ForgotPasswordPage() {
  const { t } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const modalState = { background: location.state?.background, from: location.state?.from }

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const trimmed = email.trim()
    if (!trimmed) {
      setError(t('Please enter your email address.'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send reset instructions')

      if (data.resetLink) {
        const path = resetPathFromLink(data.resetLink)
        if (path) {
          navigate(path, { replace: true, state: modalState })
          return
        }
      }

      setSuccess(
        data.message ||
          t('If an account exists with that email, you will receive password reset instructions shortly.'),
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
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
          {t('Reset your')} <em>{t('password.')}</em>
        </h1>
        <p className="auth-subtitle">
          {t('Enter the email on your account to continue.')}
        </p>

        {error && (
          <p className="form-error show" role="alert">
            <span className="material-symbols-outlined">error</span>
            <span>{error}</span>
          </p>
        )}

        {success ? (
          <div className="form-success show" role="status">
            <span className="material-symbols-outlined">mark_email_read</span>
            <span>{success}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label className="field-label" htmlFor="forgot-email">
                {t('Email')}
              </label>
              <input
                className="field-input"
                type="email"
                id="forgot-email"
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className={`btn-primary${submitting ? ' loading' : ''}`}
              disabled={submitting}
            >
              <span className="spinner" aria-hidden="true" />
              <span className="btn-label">{submitting ? t('Please wait…') : t('Continue')}</span>
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
