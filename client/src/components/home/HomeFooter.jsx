import { Link } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext.jsx'

export default function HomeFooter() {
  const { t } = useLanguage()
  const year = new Date().getFullYear()

  return (
    <footer className="home-footer">
      <div className="footer-top">
        <Link to="/" className="footer-logo">
          travelah
        </Link>
        <ul className="footer-nav">
          <li>
            <Link to="/terms" target="_blank" rel="noopener noreferrer">
              {t('Terms of Service')}
            </Link>
          </li>
          <li>
            <Link to="/privacy" target="_blank" rel="noopener noreferrer">
              {t('Privacy Policy')}
            </Link>
          </li>
        </ul>
      </div>
      <div className="footer-bottom">
        <span className="footer-copy">© {year} travelah — {t('crafted for the discerning explorer.')}</span>
        <div className="footer-social">
          <span className="material-symbols-outlined">language</span>
          <span className="material-symbols-outlined">share</span>
          <span className="material-symbols-outlined">photo_camera</span>
        </div>
      </div>
    </footer>
  )
}
