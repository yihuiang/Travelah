import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import '../styles/identity-setup-v2.css'

export default function RegisterSuccessOverlay({ open, onDiscover }) {
  const navigate = useNavigate()
  const { t } = useLanguage()

  if (!open) return null

  return (
    <div className="identity-setup-v2">
      <div className="identity-page-backdrop" aria-hidden="true" />
      <div className="identity-success-overlay">
        <div className="identity-success-card">
          <div className="identity-success-icon">
            <span className="material-symbols-outlined">check</span>
          </div>
          <h2 className="identity-success-title">
            {t("You're")} <em>{t('all set.')}</em>
          </h2>
          <p className="identity-success-sub">
            {t('Your profile is ready. Start exploring Malaysia with itineraries built around your travel identity.')}
          </p>
          <button
            type="button"
            className="identity-btn-discover"
            onClick={() => {
              if (onDiscover) {
                onDiscover()
              } else {
                navigate('/explore', { replace: true })
              }
            }}
          >
            {t('Take me to Explore')}
          </button>
        </div>
      </div>
    </div>
  )
}
