import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { codeToSettingsLanguage, LANGUAGES, useLanguage } from '../../context/LanguageContext.jsx'
import { profileInitial, resolveAvatarUrl } from '../../utils/avatar.js'

const EXPLORE_VIEW_KEY = 'travelahExploreView'

function profileDisplayName(user) {
  return user?.displayName || user?.username || user?.email?.split('@')[0] || 'Profile'
}

export default function HomeTopNav({ activePage } = {}) {
  const { language, setLanguage, ui, t, languageLabel } = useLanguage()
  const { isAuthenticated, user, updateSettings } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [langOpen, setLangOpen] = useState(false)

  const handleLanguageSelect = async (code) => {
    setLanguage(code)
    setLangOpen(false)
    if (!isAuthenticated) return
    const prevSettings = user?.settings || {}
    const nextLanguage = codeToSettingsLanguage(code)
    if (prevSettings.language === nextLanguage) return
    try {
      await updateSettings({ ...prevSettings, language: nextLanguage })
    } catch {
      // UI language still updates locally; profile sync can retry from Settings.
    }
  }

  const handleExploreClick = (event) => {
    sessionStorage.removeItem(EXPLORE_VIEW_KEY)
    if (location.pathname === '/explore') {
      event.preventDefault()
      navigate('/explore', { replace: true, state: { resetExplore: true } })
    }
  }

  return (
    <nav className="home-topbar">
      <Link to="/" className="nav-logo">
        travelah
      </Link>

      <ul className="nav-links">
        <li>
          <Link
            to="/explore"
            state={{ resetExplore: true }}
            onClick={handleExploreClick}
            className={activePage === 'explore' ? 'active' : ''}
          >
            {ui.explore}
          </Link>
        </li>
        <li>
          <Link to="/plan" className={activePage === 'plan' ? 'active' : ''}>
            {ui.plan}
          </Link>
        </li>
        <li>
          <Link to="/trips" className={activePage === 'trips' ? 'active' : ''}>
            {ui.myTrips}
          </Link>
        </li>
        <li>
          <Link to="/heritage" className={activePage === 'heritage' ? 'active' : ''}>
            {ui.heritage}
          </Link>
        </li>
      </ul>

      <div className="nav-cta">
        <div className="nav-lang-wrap">
          <button
            type="button"
            className="nav-lang"
            onClick={() => setLangOpen((open) => !open)}
            aria-expanded={langOpen}
          >
            {languageLabel}
          </button>
          {langOpen && (
            <div className="nav-lang-menu">
              {Object.values(LANGUAGES).map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  className={language === lang.code ? 'active' : ''}
                  onClick={() => handleLanguageSelect(lang.code)}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {isAuthenticated ? (
          <Link
            to="/profile"
            className="btn-pill btn-profile-nav"
            aria-label={`Profile — ${profileDisplayName(user)}`}
          >
            <span className="btn-profile-avatar">
              {resolveAvatarUrl(user?.avatarUrl) ? (
                <img src={resolveAvatarUrl(user.avatarUrl)} alt="" />
              ) : (
                <span className="btn-profile-initial">{profileInitial(user)}</span>
              )}
            </span>
            <span className="btn-profile-name">{profileDisplayName(user)}</span>
          </Link>
        ) : (
          <Link to="/login" state={{ background: location }} className="btn-pill">
            {t('Get started')}
          </Link>
        )}
      </div>
    </nav>
  )
}
