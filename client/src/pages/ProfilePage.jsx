import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import DeleteAccountConfirmModal from '../components/DeleteAccountConfirmModal.jsx'
import HomeFooter from '../components/home/HomeFooter.jsx'
import HomeTopNav from '../components/home/HomeTopNav.jsx'
import IdentitySetupOverlay from '../components/IdentitySetupOverlay.jsx'
import ProfileEditView from '../components/ProfileEditView.jsx'
import SavePlaceToast from '../components/SavePlaceToast.jsx'
import { normalizePreferences } from '../constants/travelPreferences.js'
import { useAuth } from '../context/AuthContext.jsx'
import { codeToSettingsLanguage, settingsLanguageToCode, useLanguage } from '../context/LanguageContext.jsx'
import { useTimedToast } from '../hooks/useTimedToast.js'
import { formatPreferencesForDisplay, isIdentityComplete } from '../utils/preferenceSuggestions.js'
import { resolveAvatarUrl } from '../utils/avatar.js'
import { shouldTranslateDescription, shouldTranslatePlaceName, formatPlaceLikes, pickDisplayCategory } from '../utils/localizeContent.js'
import { getPlaceImageUrl, resolvePublicAssetUrl } from '../utils/resolveImage.js'
import '../styles/home-v2.css'
import '../styles/explore-v2.css'
import '../styles/profile-v2.css'

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'zh-CN', label: '中文 Mandarin' },
]

const CURRENCY_OPTIONS = [
  { value: 'MYR', label: 'RM · Malaysian Ringgit' },
  { value: 'SGD', label: 'S$ · Singapore Dollar' },
  { value: 'USD', label: '$ · US Dollar' },
  { value: 'THB', label: '฿ · Thai Baht' },
  { value: 'IDR', label: 'Rp · Indonesian Rupiah' },
  { value: 'EUR', label: '€ · Euro' },
  { value: 'GBP', label: '£ · British Pound' },
  { value: 'JPY', label: '¥ · Japanese Yen' },
  { value: 'CNY', label: 'CN¥ · Chinese Yuan' },
  { value: 'AUD', label: 'A$ · Australian Dollar' },
]

function SettingsPicker({ id, value, onChange, disabled, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find((opt) => opt.value === value) || options[0]

  useEffect(() => {
    if (!open) return undefined
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`currency-picker${open ? ' open' : ''}`} ref={ref}>
      <button
        type="button"
        id={id}
        className="currency-picker-trigger"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="currency-picker-value">{selected.label}</span>
        <span className="material-symbols-outlined currency-picker-caret">expand_more</span>
      </button>
      {open && (
        <ul className="currency-picker-menu" role="listbox">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`currency-picker-option${opt.value === value ? ' selected' : ''}`}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                <span className="currency-picker-option-label">{opt.label}</span>
                {opt.value === value && (
                  <span className="material-symbols-outlined currency-picker-check">check</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function categoryIcon(category) {
  const key = String(category || 'CULTURE').toUpperCase()
  const icons = {
    FOOD: 'restaurant',
    CULTURE: 'museum',
    NATURE: 'landscape',
    'HIDDEN GEMS': 'diamond',
    ADVENTURE: 'hiking',
    STAY: 'hotel',
  }
  return icons[key] || 'explore'
}

function trendingBadge(rank) {
  if (rank <= 3) return { icon: 'trending_up', label: 'Hot' }
  if (rank <= 9) return { icon: 'trending_up', label: 'Rising' }
  return { icon: 'trending_flat', label: 'Steady' }
}

function SavedPlaceCard({ place, rank, onUnsave, unsaving }) {
  const { t, tPlaceName, tContent, tState, tCategory } = useLanguage()
  const primaryCategory = pickDisplayCategory(place.categories, 'CULTURE')
  const categoryLabel = tCategory(primaryCategory)
  const badge = trendingBadge(rank)
  const rankLabel = String(rank).padStart(2, '0')

  return (
    <Link to={place.href} state={{ from: '/profile' }} className="explore-place-card">
      <div className="card-hero">
        {place.image ? (
          <img className="card-hero-img" src={place.image} alt={place.title} loading="lazy" />
        ) : (
          <div className="card-hero-img card-hero-placeholder">
            <span className="material-symbols-outlined">place</span>
          </div>
        )}

        <span className="card-hero-rank" aria-hidden="true">
          {rankLabel}
        </span>

        <span className="card-hero-cat">
          <span className="material-symbols-outlined">{categoryIcon(primaryCategory)}</span>
          {categoryLabel}
        </span>

        {place.placeId ? (
          <button
            type="button"
            className="card-hero-save saved"
            onClick={onUnsave}
            onMouseDown={(event) => event.preventDefault()}
            disabled={unsaving}
            aria-label={t('Unsave place')}
            title={t('Unsave')}
          >
            <span className="material-symbols-outlined">bookmark</span>
          </button>
        ) : null}

        <div className="card-hero-foot">
          <h3 className="card-hero-title">{tPlaceName(place.title)}</h3>
        </div>
      </div>

      <div className="card-footer-bar">
        <span className="explore-stat-item">
          <span className="material-symbols-outlined">favorite</span>
          {place.likes || '—'}
        </span>
        <span className="explore-stat-item">
          <span className="material-symbols-outlined">photo_library</span>
          {place.posts} {t('posts')}
        </span>
        {badge ? (
          <span className="trending-badge">
            <span className="material-symbols-outlined">{badge.icon}</span>
            {t(badge.label)}
          </span>
        ) : null}
      </div>

      <div className="card-body">
        {place.state ? (
          <span className="explore-badge badge-state">{tState(place.state)}</span>
        ) : null}
        {place.description ? (
          <p className="explore-card-desc">{tContent(place.description)}</p>
        ) : null}
      </div>
    </Link>
  )
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const SAVED_PLACES_PAGE_SIZE = 4

function buildPageNumbers(currentPage, totalPages) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const pages = [1]
  if (currentPage > 3) pages.push('…')
  for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p += 1) {
    if (!pages.includes(p)) pages.push(p)
  }
  if (currentPage < totalPages - 2) pages.push('…')
  if (!pages.includes(totalPages)) pages.push(totalPages)
  return pages
}

function firstName(profile, user) {
  const raw = profile?.displayName || user?.displayName || user?.username || 'Traveler'
  return raw.split(' ')[0]
}

function avatarInitial(profile, user) {
  const raw = profile?.displayName || user?.displayName || user?.username || '?'
  return raw.charAt(0).toUpperCase()
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { isAuthenticated, token, logout, updatePreferences, updateProfile, updateSettings, uploadAvatar, removeAvatar, deleteAccount, user, toggleSavedPlace } =
    useAuth()
  const { t, tPlaceName, tContent, tState, queueDynamicTranslations, language, setLanguage } = useLanguage()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [editPreferences, setEditPreferences] = useState(() => normalizePreferences({}))
  const [identityError, setIdentityError] = useState(null)
  const [identitySubmitting, setIdentitySubmitting] = useState(false)
  const [profileEditError, setProfileEditError] = useState(null)
  const [passwordEditError, setPasswordEditError] = useState(null)
  const [avatarEditError, setAvatarEditError] = useState(null)
  const [personalSubmitting, setPersonalSubmitting] = useState(false)
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [currencySaving, setCurrencySaving] = useState(false)
  const [languageSaving, setLanguageSaving] = useState(false)
  const [unsavingPlaceId, setUnsavingPlaceId] = useState(null)
  const [savedPlacesPage, setSavedPlacesPage] = useState(1)
  const [placeDetails, setPlaceDetails] = useState({})
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState(null)
  const { toast: saveToast, showToast: showSaveToast } = useTimedToast()

  const handleCurrencyChange = async (nextCurrency) => {
    const prevSettings = profile?.settings || {}
    if (nextCurrency === (prevSettings.currency || 'MYR')) return
    setCurrencySaving(true)
    // Optimistic update so the dropdown reflects the choice immediately.
    setProfile((prev) => (prev ? { ...prev, settings: { ...prevSettings, currency: nextCurrency } } : prev))
    try {
      const updated = await updateSettings({ ...prevSettings, currency: nextCurrency })
      setProfile((prev) => (prev ? { ...prev, settings: updated.settings ?? { ...prevSettings, currency: nextCurrency } } : prev))
    } catch {
      setProfile((prev) => (prev ? { ...prev, settings: prevSettings } : prev))
    } finally {
      setCurrencySaving(false)
    }
  }

  const handleLanguageChange = async (nextCode) => {
    if (!nextCode || nextCode === language) return
    const prevSettings = profile?.settings || {}
    const nextLanguage = codeToSettingsLanguage(nextCode)
    setLanguage(nextCode)
    setLanguageSaving(true)
    setProfile((prev) =>
      prev ? { ...prev, settings: { ...prevSettings, language: nextLanguage } } : prev,
    )
    try {
      const updated = await updateSettings({ ...prevSettings, language: nextLanguage })
      setProfile((prev) =>
        prev ? { ...prev, settings: updated.settings ?? { ...prevSettings, language: nextLanguage } } : prev,
      )
    } catch {
      setProfile((prev) => (prev ? { ...prev, settings: prevSettings } : prev))
      setLanguage(settingsLanguageToCode(prevSettings.language))
    } finally {
      setLanguageSaving(false)
    }
  }

  async function handleConfirmDeleteAccount() {
    setDeletingAccount(true)
    setDeleteAccountError(null)
    try {
      await deleteAccount()
      setDeleteConfirmOpen(false)
      navigate('/', { replace: true })
    } catch (err) {
      setDeleteAccountError(err.message || t('Could not delete account'))
    } finally {
      setDeletingAccount(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setLoading(false)
      return
    }

    fetch('/api/profile/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (res.status === 401 || res.status === 404) {
          logout()
          throw new Error(
            res.status === 404
              ? 'Your account was not found. Please sign in again.'
              : 'Your session expired. Please sign in again.',
          )
        }
        if (!res.ok) {
          throw new Error(data.error || 'Could not load profile')
        }
        return data
      })
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [isAuthenticated, token, logout])

  const preferences = useMemo(
    () => formatPreferencesForDisplay(profile?.preferences),
    [profile?.preferences],
  )

  const settings = profile?.settings || {}
  const displayName = firstName(profile, user)

  const normalizedProfilePreferences = useMemo(
    () => normalizePreferences(profile?.preferences),
    [profile?.preferences],
  )

  const stats = useMemo(() => {
    const itineraries = profile?.savedItineraries || []
    const saved = profile?.savedPlaces || []
    const tripsPlanned = itineraries.length
    const statesVisited = new Set(
      [...itineraries, ...saved]
        .map((item) => item.location)
        .filter(Boolean)
        .map((location) => location.split(',').pop()?.trim())
        .filter(Boolean),
    ).size

    return [
      { value: String(tripsPlanned), label: t('Trips planned') },
      { value: String(statesVisited), label: t('States visited') },
      { value: String(saved.length), label: t('Places saved') },
    ]
  }, [profile?.savedItineraries, profile?.savedPlaces])

  const savedPlaces = useMemo(() => {
    const items = profile?.savedPlaces || []
    return items.map((item, index) => {
      const detail = item.placeId ? placeDetails[item.placeId] : null
      const state = detail?.state || item.location?.split(',')[0]?.trim() || item.location || ''
      const categories = detail?.categories?.length ? detail.categories : ['CULTURE']
      const description = detail?.description || item.description || t('Bookmarked from Explore.')
      const image =
        getPlaceImageUrl(detail?.coverImage || item.image) ||
        resolvePublicAssetUrl('/images/hero-batu-caves.jpg')

      return {
        id: item.placeId || `${item.title}-${index}`,
        placeId: item.placeId || null,
        href: item.placeId ? `/explore/place/${item.placeId}` : '/explore',
        image,
        state,
        categories,
        title: item.title || detail?.name || 'Saved place',
        description,
        likes: detail ? formatPlaceLikes(detail) : '—',
        posts: detail?.postCount || 0,
      }
    })
  }, [profile?.savedPlaces, placeDetails, t])

  useEffect(() => {
    const ids = [...new Set((profile?.savedPlaces || []).map((item) => item.placeId).filter(Boolean))]
    if (!ids.length) {
      setPlaceDetails({})
      return undefined
    }

    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(
              `/api/places/${encodeURIComponent(id)}/posts?lang=${encodeURIComponent(language)}`,
            )
            if (!res.ok) return [id, null]
            const data = await res.json()
            return [id, data.place || null]
          } catch {
            return [id, null]
          }
        }),
      )
      if (cancelled) return
      setPlaceDetails(Object.fromEntries(entries.filter(([, place]) => place)))
    })()

    return () => {
      cancelled = true
    }
  }, [profile?.savedPlaces, language])

  const savedPlacesTotalPages = Math.max(1, Math.ceil(savedPlaces.length / SAVED_PLACES_PAGE_SIZE))
  const savedPlacesPageStart = (savedPlacesPage - 1) * SAVED_PLACES_PAGE_SIZE
  const pagedSavedPlaces = savedPlaces.slice(savedPlacesPageStart, savedPlacesPageStart + SAVED_PLACES_PAGE_SIZE)
  const savedPlacesPageNumbers = buildPageNumbers(savedPlacesPage, savedPlacesTotalPages)

  useEffect(() => {
    setSavedPlacesPage((page) => Math.min(page, savedPlacesTotalPages))
  }, [savedPlaces.length, savedPlacesTotalPages])

  useEffect(() => {
    const texts = new Set()
    for (const item of profile?.savedPlaces || []) {
      const name = item.title || ''
      const desc = item.description || ''
      if (shouldTranslatePlaceName(name, language)) texts.add(name)
      if (shouldTranslateDescription(desc, language)) texts.add(desc)
    }
    if (texts.size) queueDynamicTranslations(Array.from(texts))
  }, [profile?.savedPlaces, language, queueDynamicTranslations])

  async function handleUnsavePlace(placeId, event) {
    event.preventDefault()
    event.stopPropagation()
    if (!placeId || unsavingPlaceId) return

    setUnsavingPlaceId(placeId)
    try {
      const updated = await toggleSavedPlace(placeId, false)
      setProfile((prev) => (prev ? { ...prev, savedPlaces: updated.savedPlaces || [] } : prev))
      showSaveToast({ message: t('Removed from your profile'), icon: 'bookmark_remove' })
    } catch {
      // keep list unchanged on failure
    } finally {
      setUnsavingPlaceId(null)
    }
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: { pathname: '/profile' }, background: { pathname: '/' } }} replace />
  }

  function openIdentityEditor() {
    setEditPreferences(normalizePreferences(profile?.preferences))
    setIdentityError(null)
    setEditingIdentity(true)
  }

  function closeIdentityEditor() {
    if (!identitySubmitting) {
      setEditingIdentity(false)
      setIdentityError(null)
    }
  }

  function openProfileEditor() {
    setProfileEditError(null)
    setPasswordEditError(null)
    setAvatarEditError(null)
    setEditingProfile(true)
  }

  function closeProfileEditor() {
    if (!personalSubmitting && !passwordSubmitting && !avatarUploading) {
      setEditingProfile(false)
      setProfileEditError(null)
      setPasswordEditError(null)
      setAvatarEditError(null)
    }
  }

  async function handleUploadAvatar(file) {
    setAvatarEditError(null)
    setAvatarUploading(true)
    try {
      if (file.size > MAX_AVATAR_BYTES) {
        throw new Error('Image must be 2 MB or smaller.')
      }
      const updated = await uploadAvatar(file, true)
      setProfile(updated)
    } catch (err) {
      setAvatarEditError(err.message)
      throw err
    } finally {
      setAvatarUploading(false)
    }
  }

  async function handleRemoveAvatar() {
    if (!resolveAvatarUrl(profile?.avatarUrl)) return
    setAvatarEditError(null)
    setAvatarUploading(true)
    try {
      const updated = await removeAvatar(true)
      setProfile(updated)
    } catch (err) {
      setAvatarEditError(err.message)
      throw err
    } finally {
      setAvatarUploading(false)
    }
  }

  async function handleSaveIdentity() {
    if (!isIdentityComplete(editPreferences)) {
      setIdentityError('Please choose at least one option for each category.')
      return
    }
    setIdentityError(null)
    setIdentitySubmitting(true)
    try {
      const updated = await updatePreferences(editPreferences, true)
      setProfile((prev) =>
        prev ? { ...prev, preferences: updated.preferences ?? editPreferences } : prev,
      )
      setEditingIdentity(false)
    } catch (err) {
      setIdentityError(err.message)
    } finally {
      setIdentitySubmitting(false)
    }
  }

  async function handleSavePersonal(payload) {
    setProfileEditError(null)
    setPersonalSubmitting(true)
    try {
      const nameOrEmailChanged =
        payload.displayName !== profile?.displayName ||
        payload.email !== (profile?.email || '')

      if (nameOrEmailChanged) {
        const updated = await updateProfile(
          { displayName: payload.displayName, email: payload.email },
          true,
        )
        setProfile(updated)
      }
      return true
    } catch (err) {
      setProfileEditError(err.message)
      return false
    } finally {
      setPersonalSubmitting(false)
    }
  }

  async function handleSavePassword(payload) {
    if (payload.validationError) {
      setPasswordEditError(payload.validationError)
      return false
    }
    if (!payload.newPassword) {
      setPasswordEditError('Enter a new password.')
      return false
    }
    if (!payload.currentPassword) {
      setPasswordEditError('Enter your current password.')
      return false
    }

    setPasswordEditError(null)
    setPasswordSubmitting(true)
    try {
      const updated = await updateProfile(
        {
          currentPassword: payload.currentPassword,
          newPassword: payload.newPassword,
        },
        true,
      )
      setProfile(updated)
      return true
    } catch (err) {
      setPasswordEditError(err.message)
      return false
    } finally {
      setPasswordSubmitting(false)
    }
  }

  return (
    <div className="home-v2 profile-v2 min-h-screen flex flex-col">
      <HomeTopNav activePage="profile" />

      {editingProfile && profile ? (
        <>
          <header className="profile-edit-header">
            <button
              type="button"
              className="btn-back-profile"
              onClick={closeProfileEditor}
              disabled={personalSubmitting || passwordSubmitting || avatarUploading}
            >
              <span className="material-symbols-outlined">arrow_back</span>
              {t('Back to profile')}
            </button>
            <div className="edit-eyebrow">
              {language !== 'zh-CN' ? <div className="edit-eyebrow-dot" /> : null}
              <span className="edit-eyebrow-text">{t('Account settings')}</span>
            </div>
            <h1 className="edit-title">
              {t('Edit profile')} <em>{t('details.')}</em>
            </h1>
            <p className="edit-sub">{t('Update your photo, name, email, and password.')}</p>
          </header>
          <ProfileEditView
            profile={profile}
            onSavePersonal={handleSavePersonal}
            onSavePassword={handleSavePassword}
            onUploadAvatar={handleUploadAvatar}
            onRemoveAvatar={handleRemoveAvatar}
            personalSubmitting={personalSubmitting}
            passwordSubmitting={passwordSubmitting}
            avatarUploading={avatarUploading}
            personalError={profileEditError}
            passwordError={passwordEditError}
            avatarError={avatarEditError}
          />
        </>
      ) : (
        <>
          <div className="profile-hero">
            <div className="profile-hero-inner">
              <div>
                <div className="hero-eyebrow">
                  {language !== 'zh-CN' ? <div className="hero-eyebrow-dot" /> : null}
                  <span className="hero-eyebrow-text">{t('Account settings')}</span>
                </div>
                <h1 className="hero-headline">
                  {t('profileHeroYour')}
                  <br />
                  <em>{t('profileHeroTitle')}</em>
                </h1>
                <p className="hero-sub">
                  {t('Manage your travel identity, preferences, and saved collections — all in one place.')}
                </p>
              </div>
              {profile && (
                <div className="avatar-card">
                  <div className="avatar-ring">
                    {resolveAvatarUrl(profile.avatarUrl) ? (
                      <img src={resolveAvatarUrl(profile.avatarUrl)} alt={profile.displayName} />
                    ) : (
                      avatarInitial(profile, user)
                    )}
                  </div>
                  <div>
                    <p className="avatar-name">{profile.displayName || displayName}</p>
                    <p className="avatar-handle">{profile.email || t('No email set')}</p>
                  </div>
                  <span className="avatar-tier">
                    <span className="material-symbols-outlined">workspace_premium</span> {t('Explorer')}
                  </span>
                  <button type="button" className="btn-edit-avatar" onClick={openProfileEditor}>
                    <span className="material-symbols-outlined">edit</span> {t('Edit')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="stats-strip">
            <div className="stats-inner">
              {stats.map((stat, i) => (
                <span key={stat.label} style={{ display: 'contents' }}>
                  {i > 0 && <span className="stat-divider" aria-hidden="true" />}
                  <div className="stat-item">
                    <span className="stat-value">{stat.value}</span>
                    <span className="stat-label">{stat.label}</span>
                  </div>
                </span>
              ))}
            </div>
          </div>

          {loading && <p className="profile-loading">Loading profile…</p>}
          {error && <p className="profile-error">{error}</p>}

          {!loading && !error && profile && (
            <main className="profile-wrap">
              <aside className="sidebar">
                <div className="card nav-card">
                  <h2 className="card-title">{t('Account')}</h2>
                  <Link to="/trips">
                    <span className="material-symbols-outlined">luggage</span> {t('My Trips')}
                    <span className="material-symbols-outlined nav-arrow">chevron_right</span>
                  </Link>
                  <Link to="/plan">
                    <span className="material-symbols-outlined">auto_awesome</span> {t('Plan a Trip')}
                    <span className="material-symbols-outlined nav-arrow">chevron_right</span>
                  </Link>
                </div>

                <div className="card">
                  <span className="material-symbols-outlined card-watermark">local_florist</span>
                  <h2 className="card-title">{t('Travel Identity')}</h2>
                  <div className="identity-row">
                    <span className="identity-key">{t('Pace')}</span>
                    <span className="identity-val">{t(preferences.pace)}</span>
                  </div>
                  <div className="identity-row">
                    <span className="identity-key">{t('Focus')}</span>
                    <span className="identity-val">{t(preferences.focus)}</span>
                  </div>
                  <div className="identity-row">
                    <span className="identity-key">{t('Dining')}</span>
                    <span className="identity-val">{t(preferences.dining)}</span>
                  </div>
                  <div className="identity-row">
                    <span className="identity-key">{t('Budget')}</span>
                    <span className="identity-val">{t(preferences.budget)}</span>
                  </div>
                  <button type="button" className="btn-outline-full" onClick={openIdentityEditor}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      tune
                    </span>
                    {t('Refine preferences')}
                  </button>
                </div>

                <div className="card settings-card">
                  <h2 className="card-title">{t('Settings')}</h2>
                  <label className="field-label" htmlFor="profile-language">
                    {t('Language')}
                  </label>
                  <SettingsPicker
                    id="profile-language"
                    value={language}
                    onChange={handleLanguageChange}
                    disabled={languageSaving}
                    options={LANGUAGE_OPTIONS}
                  />

                  <label className="field-label">{t('Preferred currency')}</label>
                  <SettingsPicker
                    value={settings.currency || 'MYR'}
                    onChange={handleCurrencyChange}
                    disabled={currencySaving}
                    options={CURRENCY_OPTIONS}
                  />

                  <button type="button" className="btn-signout" onClick={logout}>
                    <span className="material-symbols-outlined">logout</span> {t('Sign out')}
                  </button>
                </div>
              </aside>

              <div className="right-content">
                <section id="collections">
                  <div className="section-head">
                    <div>
                      <p className="section-eyebrow">{t('Bookmarked from Explore')}</p>
                      <h2 className="section-title">{t('Saved Places')}</h2>
                    </div>
                    <Link to="/explore" className="view-all">
                      {t('Browse more')} <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                    </Link>
                  </div>
                  {savedPlaces.length > 0 ? (
                    <div className="explore-v2 profile-saved-places">
                      <p className="result-count">
                        {t('Showing')}{' '}
                        <span>
                          {savedPlacesPageStart + 1}–{Math.min(savedPlacesPageStart + SAVED_PLACES_PAGE_SIZE, savedPlaces.length)}
                        </span>{' '}
                        {t('showingOf')} <span>{savedPlaces.length}</span> {t('places')}
                      </p>
                      <div className="cards-grid">
                        {pagedSavedPlaces.map((place, index) => (
                          <SavedPlaceCard
                            key={place.id}
                            place={place}
                            rank={savedPlacesPageStart + index + 1}
                            unsaving={unsavingPlaceId === place.placeId}
                            onUnsave={(event) => handleUnsavePlace(place.placeId, event)}
                          />
                        ))}
                      </div>
                      {savedPlacesTotalPages > 1 ? (
                        <div className="explore-pagination">
                          <span className="page-info">
                            {t('Page')} {savedPlacesPage} {t('pageOf')} {savedPlacesTotalPages}
                          </span>
                          <div className="page-controls">
                            <button
                              type="button"
                              className="page-btn"
                              disabled={savedPlacesPage === 1}
                              onClick={() => setSavedPlacesPage((p) => Math.max(1, p - 1))}
                            >
                              ← {t('Prev')}
                            </button>
                            {savedPlacesPageNumbers.map((page, index) =>
                              page === '…' ? (
                                <span key={`ellipsis-${index}`} className="page-ellipsis">
                                  …
                                </span>
                              ) : (
                                <button
                                  key={page}
                                  type="button"
                                  className={`page-btn${savedPlacesPage === page ? ' current' : ''}`}
                                  onClick={() => setSavedPlacesPage(page)}
                                >
                                  {page}
                                </button>
                              ),
                            )}
                            <button
                              type="button"
                              className="page-btn"
                              disabled={savedPlacesPage === savedPlacesTotalPages}
                              onClick={() => setSavedPlacesPage((p) => Math.min(savedPlacesTotalPages, p + 1))}
                            >
                              {t('Next')} →
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="profile-empty">{t('No saved places yet. Bookmark destinations from Explore.')}</p>
                  )}
                </section>

                <section>
                  <div className="section-head">
                    <div>
                      <p className="section-eyebrow">{t('Irreversible actions')}</p>
                      <h2 className="section-title">{t('Account')}</h2>
                    </div>
                  </div>
                  <div className="danger-card">
                    <h3 className="danger-title">{t('Delete account')}</h3>
                    <p className="danger-sub">
                      {t("This permanently removes your profile, all saved trips, collections, and preferences. There's no way to undo this.")}
                    </p>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => {
                        setDeleteAccountError(null)
                        setDeleteConfirmOpen(true)
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        delete
                      </span>
                      {t('Delete my account')}
                    </button>
                  </div>
                </section>
              </div>
            </main>
          )}
        </>
      )}

      <HomeFooter />

      <SavePlaceToast toast={saveToast} />

      <DeleteAccountConfirmModal
        open={deleteConfirmOpen}
        loading={deletingAccount}
        error={deleteAccountError}
        onConfirm={handleConfirmDeleteAccount}
        onCancel={() => {
          if (!deletingAccount) setDeleteConfirmOpen(false)
        }}
      />

      <IdentitySetupOverlay
        open={editingIdentity}
        variant="edit"
        preferences={editPreferences}
        onChange={setEditPreferences}
        onSubmit={handleSaveIdentity}
        submitting={identitySubmitting}
        error={identityError}
        username={profile?.username || user?.username}
        onClose={closeIdentityEditor}
      />
    </div>
  )
}
