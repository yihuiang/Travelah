import { useChat } from '../../context/ChatContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import ConciergeThread from './ConciergeThread.jsx'
import '../../styles/concierge.css'

// Global floating concierge — available on every page. Shares its conversation
// with the homepage section through ChatContext.
export default function ConciergeWidget() {
  const { t } = useLanguage()
  const { open, openWidget, closeWidget } = useChat()

  return (
    <>
      <button
        type="button"
        className={`concierge-launcher${open ? ' is-open' : ''}`}
        onClick={open ? closeWidget : openWidget}
        aria-label={open ? t('Close') : t('Open Travelah AI')}
      >
        <span className="material-symbols-outlined">{open ? 'close' : 'auto_awesome'}</span>
        {!open && <span className="concierge-launcher-label">{t('Ask AI')}</span>}
      </button>

      {open && (
        <div className="concierge-popup" role="dialog" aria-label="Travelah AI">
          <div className="concierge-popup-head">
            <span className="concierge-popup-title">
              <span className="concierge-popup-dot" />
              {t('Travelah AI')}
            </span>
            <div className="concierge-popup-actions">
              <button
                type="button"
                className="concierge-icon-btn"
                onClick={closeWidget}
                aria-label={t('Close')}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>
          <div className="concierge-popup-body">
            <ConciergeThread />
          </div>
        </div>
      )}
    </>
  )
}
