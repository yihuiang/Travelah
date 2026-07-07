import { useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function DeleteAccountConfirmModal({ open, loading, error, onConfirm, onCancel }) {
  const { t } = useLanguage()

  useEffect(() => {
    if (!open) return undefined

    function onKeyDown(event) {
      if (event.key === 'Escape' && !loading) onCancel?.()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div className="delete-account-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title">
      <button
        type="button"
        className="delete-account-confirm-backdrop"
        onClick={onCancel}
        disabled={loading}
        aria-label={t('Cancel')}
      />
      <div className="delete-account-confirm-card">
        <h3 id="delete-account-title">{t('Delete your account?')}</h3>
        <p>
          {t(
            "This permanently removes your profile, all saved trips, collections, and preferences. There's no way to undo this.",
          )}
        </p>
        {error ? <p className="delete-account-confirm-error">{error}</p> : null}
        <div className="delete-account-confirm-actions">
          <button type="button" className="delete-account-btn ghost" onClick={onCancel} disabled={loading}>
            {t('Go back')}
          </button>
          <button type="button" className="delete-account-btn danger" onClick={onConfirm} disabled={loading}>
            {loading ? (
              <>
                <span className="material-symbols-outlined spin">hourglass_empty</span>
                {t('Deleting…')}
              </>
            ) : (
              t('Delete my account')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
