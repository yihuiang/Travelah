import { useLanguage } from '../context/LanguageContext.jsx'
import '../styles/identity-setup-v2.css'
import IdentityPreferencesForm from './IdentityPreferencesForm.jsx'

export default function IdentitySetupOverlay({
  open,
  preferences,
  onChange,
  onSubmit,
  submitting,
  error,
  username,
  variant = 'onboarding',
  onClose,
  onSkip,
}) {
  const { t } = useLanguage()
  const isEdit = variant === 'edit'
  const name = username?.trim()

  if (!open) return null

  return (
    <div className="identity-setup-v2">
      {!isEdit && <div className="identity-page-backdrop" aria-hidden="true" />}

      <div
        className="identity-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="identity-setup-title"
        onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}
      >
        <div className="identity-modal">
          {onClose && (
            <button
              type="button"
              className="identity-modal-close"
              aria-label={isEdit ? 'Close' : 'Skip for now'}
              onClick={onClose}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                close
              </span>
            </button>
          )}

          <header className="identity-modal-header">
            <p className="identity-modal-logo">travelah</p>
            {!isEdit && (
              <div className="identity-modal-eyebrow">
                <div className="identity-modal-eyebrow-dot" />
                <span className="identity-modal-eyebrow-text">{t('Almost there')}</span>
              </div>
            )}
            <h1 className="identity-modal-title" id="identity-setup-title">
              {isEdit ? (
                t('Your travel identity')
              ) : (
                <>
                  {t('Welcome')}, {name ? <em>{name}</em> : <em>{t('traveler')}</em>}
                </>
              )}
            </h1>
            <p className="identity-modal-sub">
              {isEdit
                ? t('Update how you travel so we can refine your suggestions.')
                : t('One more step — tell us how you travel so we can personalise your itineraries.')}
            </p>
          </header>

          <IdentityPreferencesForm
            preferences={preferences}
            onChange={onChange}
            onSubmit={onSubmit}
            submitting={submitting}
            error={error}
            variant={variant}
            onSkip={onSkip}
          />
        </div>
      </div>
    </div>
  )
}
