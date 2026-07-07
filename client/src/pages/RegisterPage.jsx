import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthModal from '../components/AuthModal.jsx'
import SocialAuthButtons from '../components/SocialAuthButtons.jsx'
import IdentitySetupOverlay from '../components/IdentitySetupOverlay.jsx'
import RegisterSuccessOverlay from '../components/RegisterSuccessOverlay.jsx'
import { DEFAULT_PREFERENCES, normalizePreferences } from '../constants/travelPreferences.js'
import { isIdentityComplete, needsOnboarding } from '../utils/preferenceSuggestions.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

function getPasswordValidationError(value) {
  if (!value) return 'Password is required.'
  if (value.length < 8) return 'Password must be at least 8 characters.'
  return ''
}

function getEmailValidationError(value) {
  const trimmed = value.trim()
  if (!trimmed) return 'Email is required.'
  const atIndex = trimmed.indexOf('@')
  const domainPart = atIndex >= 0 ? trimmed.slice(atIndex + 1) : ''
  if (atIndex <= 0 || !domainPart.includes('.')) {
    return 'Enter a valid email (e.g. name@example.com).'
  }
  return ''
}

export default function RegisterPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, register, updatePreferences, registerWithGoogle } = useAuth()
  const { t } = useLanguage()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [setupStep, setSetupStep] = useState('account')
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  const [identityError, setIdentityError] = useState(null)
  const [identitySubmitting, setIdentitySubmitting] = useState(false)

  const modalState = { background: location.state?.background, from: location.state?.from }
  const googleSignup = location.state?.googleSignup
  const googleEmailLocked = Boolean(googleSignup?.email)
  const passwordError = passwordTouched ? getPasswordValidationError(password) : ''
  const emailError = emailTouched ? getEmailValidationError(email) : ''
  const afterOnboardingPath = location.state?.from?.pathname || '/explore'

  useEffect(() => {
    if (!googleSignup) return
    if (googleSignup.email) setEmail(googleSignup.email)
    if (googleSignup.displayName) setDisplayName(googleSignup.displayName)
  }, [googleSignup])

  useEffect(() => {
    if (!location.state?.onboarding || !user) return
    if (needsOnboarding(user)) {
      setDisplayName(user.displayName || '')
      setPreferences(normalizePreferences(user.preferences))
      setSetupStep('identity')
    } else {
      navigate(afterOnboardingPath, { replace: true })
    }
  }, [location.state?.onboarding, user, afterOnboardingPath, navigate])

  function beginIdentitySetup(nextUser) {
    setDisplayName(nextUser.displayName || '')
    setPreferences(normalizePreferences(nextUser.preferences))
    setSetupStep('identity')
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!displayName.trim() || !email.trim() || !password) {
      setError('Please fill in all fields.')
      return
    }
    const nextPasswordError = getPasswordValidationError(password)
    if (nextPasswordError) {
      setPasswordTouched(true)
      setError(nextPasswordError)
      return
    }
    const nextEmailError = getEmailValidationError(email)
    if (nextEmailError) {
      setEmailTouched(true)
      setError(nextEmailError)
      return
    }
    if (!termsAccepted) {
      setError('Please agree to the Terms & Privacy Policy.')
      return
    }

    setError(null)
    setSubmitting(true)
    const username =
      email.split('@')[0]?.replace(/\W/g, '') || displayName.replace(/\s+/g, '').toLowerCase() || 'traveler'
    try {
      const newUser = await register(
        { username, email: email.trim(), password, displayName: displayName.trim() || username },
        true,
      )
      beginIdentitySetup(newUser)
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
      const { user: signedInUser } = await registerWithGoogle(credential, true)
      if (needsOnboarding(signedInUser)) {
        beginIdentitySetup(signedInUser)
      } else {
        navigate(afterOnboardingPath, { replace: true })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setGoogleSubmitting(false)
    }
  }

  async function handleSaveIdentity() {
    if (!isIdentityComplete(preferences)) {
      setIdentityError('Please choose at least one option for each category.')
      return
    }
    setIdentityError(null)
    setIdentitySubmitting(true)
    try {
      await updatePreferences(preferences, true)
      setSetupStep('done')
    } catch (err) {
      setIdentityError(err.message)
    } finally {
      setIdentitySubmitting(false)
    }
  }

  return (
    <>
      {setupStep === 'account' && (
        <AuthModal variant="signup">
          <div className="auth-view-signup">
          <p className="auth-logo">travelah</p>
          <div className="auth-eyebrow">
            <div className="auth-eyebrow-dot" />
            <span className="auth-eyebrow-text">{t('Join free')}</span>
          </div>
          <h1 className="auth-title">
            {t('Create your')} <em>{t('account.')}</em>
          </h1>
          <p className="auth-subtitle">
            {t('Takes 30 seconds. Save trips, get AI itineraries, explore like a local.')}
          </p>

          {googleSignup?.email && (
            <p className="form-info show" role="status">
              <span className="material-symbols-outlined">info</span>
              <span>
                {t('Create an account with your Google email, then choose a password.')}
              </span>
            </p>
          )}

          {error && (
            <p className="form-error show" role="alert">
              <span className="material-symbols-outlined">error</span>
              <span>{error}</span>
            </p>
          )}

          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label className="field-label" htmlFor="signup-name">
                {t('Full name')}
              </label>
              <input
                className="field-input"
                type="text"
                id="signup-name"
                name="fullName"
                placeholder="Your name"
                autoComplete="name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="signup-email">
                {t('Email')}
              </label>
              <input
                className={`field-input${googleEmailLocked ? ' field-input--locked' : ''}`}
                type="email"
                id="signup-email"
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
                readOnly={googleEmailLocked}
                value={email}
                onBlur={() => setEmailTouched(true)}
                aria-invalid={emailError ? 'true' : 'false'}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (!emailTouched) setEmailTouched(true)
                }}
              />
              {emailError ? (
                <p className="pw-hint pw-hint--error">{emailError}</p>
              ) : null}
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="signup-pw">
                {t('Password')}
              </label>
              <div className="password-wrap">
                <input
                  className="field-input"
                  type={showPassword ? 'text' : 'password'}
                  id="signup-pw"
                  name="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onBlur={() => setPasswordTouched(true)}
                  aria-invalid={passwordError ? 'true' : 'false'}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (!passwordTouched) setPasswordTouched(true)
                  }}
                />
                <button
                  type="button"
                  className="btn-toggle-pw"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              <p className={`pw-hint${passwordError ? ' pw-hint--error' : ''}`}>
                {passwordError || t('At least 8 characters.')}
              </p>
            </div>

            <div className="form-row terms-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  id="signup-terms"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span>
                  {t('I agree to the')}{' '}
                  <Link
                    to="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-inline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t('Terms')}
                  </Link>{' '}
                  &amp;{' '}
                  <Link
                    to="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-inline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t('Privacy Policy')}
                  </Link>
                </span>
              </label>
            </div>

            <button
              type="submit"
              className={`btn-primary${submitting ? ' loading' : ''}`}
              disabled={submitting}
            >
              <span className="spinner" aria-hidden="true" />
              <span className="btn-label">{submitting ? t('Creating account…') : t('Create account')}</span>
            </button>
          </form>

          {!googleEmailLocked && (
            <>
              <div className="divider">
                <div className="divider-line" />
                <span className="divider-text">{t('or sign up with')}</span>
                <div className="divider-line" />
              </div>

              <SocialAuthButtons
                compact
                disabled={submitting || googleSubmitting}
                onGoogleSuccess={handleGoogleSuccess}
                onGoogleError={setError}
              />
            </>
          )}

          <p className="auth-switch">
            {t('Already have an account?')}{' '}
            <Link to="/login" state={modalState} replace>
              {t('Sign in')}
            </Link>
          </p>
          </div>
        </AuthModal>
      )}

      <IdentitySetupOverlay
        open={setupStep === 'identity'}
        preferences={preferences}
        onChange={setPreferences}
        onSubmit={handleSaveIdentity}
        submitting={identitySubmitting}
        error={identityError}
        username={displayName.trim() || user?.displayName || ''}
        onClose={() => navigate(afterOnboardingPath, { replace: true })}
        onSkip={() => navigate(afterOnboardingPath, { replace: true })}
      />

      <RegisterSuccessOverlay
        open={setupStep === 'done'}
        onDiscover={() => navigate(afterOnboardingPath, { replace: true })}
      />
    </>
  )
}
