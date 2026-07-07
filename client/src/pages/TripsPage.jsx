import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import HomeFooter from '../components/home/HomeFooter.jsx'
import HomeTopNav from '../components/home/HomeTopNav.jsx'
import TripSummaryCard from '../components/trips/TripSummaryCard.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getTripsHeadline } from '../i18n/trips-headline.js'
import { translateTemplate } from '../i18n/template.js'
import PackingList from '../components/trips/PackingList.jsx'
import TripBudget from '../components/trips/TripBudget.jsx'
import {
  destinationFromLocation,
  destinationsFromLocation,
  destinationsFromTrip,
  extractState,
  formatTripDates,
  nightsBetween,
  tripBadge,
} from '../utils/tripDisplay.js'
import '../styles/home-v2.css'
import '../styles/trips-v2.css'

function TripPicker({ options, value, onChange, t }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find((opt) => opt.id === value)

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
    <div className={`trip-picker${open ? ' open' : ''}`} ref={ref}>
      <button
        type="button"
        className="trip-picker-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="material-symbols-outlined trip-picker-icon">luggage</span>
        <span className="trip-picker-value">{selected?.name || t('Select trip')}</span>
        <span className="material-symbols-outlined trip-picker-caret">expand_more</span>
      </button>
      {open && (
        <ul className="trip-picker-menu" role="listbox">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                role="option"
                aria-selected={opt.id === value}
                className={`trip-picker-option${opt.id === value ? ' selected' : ''}`}
                onClick={() => {
                  onChange(opt.id)
                  setOpen(false)
                }}
              >
                <span className="trip-picker-option-label">{opt.name}</span>
                {opt.id === value && (
                  <span className="material-symbols-outlined trip-picker-check">check</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function buildTripNavState(item, index) {
  const destinations = destinationsFromTrip(item)
  const dest =
    destinations.length > 1 ? destinations.join(' → ') : destinations[0] || destinationFromLocation(item.location)
  const tripId = item.id || `trip-${index}`
  return {
    pathname: `/itinerary/trip/${encodeURIComponent(tripId)}`,
    state: {
      tripId,
      title: item.title || null,
      location: item.location || null,
      destination: dest,
      destinations,
      startDate: item.startDate || null,
      endDate: item.endDate || null,
      itinerary: item.itinerary || null,
      vibes: item.vibes || [],
      pace: item.pace || 'balanced',
      budget: item.budget || 'mid',
      daysPerDestination: item.daysPerDestination || null,
      vibeLabels: item.vibeLabels || item.description || null,
      paceLabel: item.paceLabel || null,
      budgetLabel: item.budgetLabel || null,
    },
  }
}

export default function TripsPage() {
  const { user, isAuthenticated, token, logout } = useAuth()
  const { t, language } = useLanguage()
  const tripsHeadline = getTripsHeadline(language)
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const joinInputRef = useRef(null)
  const location = useLocation()
  const justSaved = Boolean(location.state?.saved)
  const savedProfile = location.state?.profile || null
  const [profile, setProfile] = useState(savedProfile)
  const [loading, setLoading] = useState(!savedProfile)
  const [viewMode, setViewMode] = useState('grid')
  const [selectedTripId, setSelectedTripId] = useState(null)

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setProfile(null)
      setLoading(false)
      return
    }

    if (savedProfile && justSaved) {
      setProfile(savedProfile)
      setLoading(false)
    }

    setLoading(true)
    fetch('/api/profile/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (res.status === 401) {
          logout()
          throw new Error('Session expired')
        }
        if (res.status === 404) {
          throw new Error(data.error || 'Could not load trips')
        }
        if (!res.ok) throw new Error(data.error || 'Could not load trips')
        return data
      })
      .then(setProfile)
      .catch(() => {
        if (!savedProfile) setProfile(null)
      })
      .finally(() => setLoading(false))
  }, [isAuthenticated, token, logout, justSaved, savedProfile])

  const itineraries = profile?.savedItineraries || []

  const tripCards = useMemo(() => {
    return itineraries.map((item, index) => {
      const { badge, labelKey, labelParams } = tripBadge(item)
      const badgeLabel = translateTemplate(t, labelKey, labelParams)
      const dest = destinationFromLocation(item.location)
      const isActive = badge === 'live'
      const navState = buildTripNavState(item, index)
      return {
        id: item.id || `${item.title}-${index}`,
        href: navState.pathname,
        navState,
        featured: isActive || (index === 0 && !itineraries.some((trip) => tripBadge(trip).badge === 'live')),
        badge,
        badgeLabel,
        dates: formatTripDates(item, { t, language }),
        name: item.title || dest,
        meta: item.description ? [{ text: item.description }] : [{ text: item.location || t('Malaysia') }],
      }
    })
  }, [itineraries, t, language])

const stats = useMemo(() => {
    const saved = profile?.savedPlaces || []
    const tripsPlanned = itineraries.length
    const nightsBooked = itineraries.reduce(
      (sum, item) => sum + nightsBetween(item.startDate, item.endDate),
      0,
    )
    const statesVisited = new Set(
      [...itineraries, ...saved]
        .map((item) => extractState(item.location))
        .filter(Boolean),
    ).size
    const activeCount = itineraries.filter((item) => tripBadge(item).badge === 'live').length

    return {
      items: [
        { value: String(tripsPlanned), label: t('Trips planned') },
        { value: nightsBooked > 0 ? String(nightsBooked) : '—', label: t('Nights booked') },
        { value: statesVisited > 0 ? String(statesVisited) : '—', label: t('States visited') },
        { value: String(saved.length), label: t('Places saved') },
      ],
      activeCount,
      tripsPlanned,
    }
  }, [itineraries, profile?.savedPlaces, t])

  const displayName = useMemo(() => {
    if (!isAuthenticated || !user) return null
    const name = user.displayName || user.username || user.email?.split('@')[0]
    return name ? name.split(' ')[0] : null
  }, [isAuthenticated, user])

  const heroSub = useMemo(() => {
    if (justSaved) return t('Your trip has been saved. You can open it anytime from here.')
    if (!isAuthenticated) return t('Sign in to see your saved trips and plan your next journey.')
    if (loading) return t('Loading your trips…')
    if (stats.tripsPlanned === 0) return t('No trips yet — plan your first Malaysian adventure.')
    if (stats.activeCount > 0) {
      return translateTemplate(t, 'Trips planned with active summary', {
        n: stats.tripsPlanned,
        a: stats.activeCount,
      })
    }
    return translateTemplate(t, 'Trips planned summary', { n: stats.tripsPlanned })
  }, [justSaved, isAuthenticated, loading, stats.tripsPlanned, stats.activeCount, t])

  const tripOptions = useMemo(
    () =>
      itineraries.map((item, index) => {
        const destinations = destinationsFromTrip(item)
        const dest =
          destinations.length > 1
            ? destinations.join(' → ')
            : destinations[0] || destinationFromLocation(item.location)
        return { id: item.id || `trip-${index}`, name: item.title || dest }
      }),
    [itineraries],
  )

  const defaultTripId = useMemo(() => {
    const activeIndex = itineraries.findIndex((item) => tripBadge(item).badge === 'live')
    const index = activeIndex >= 0 ? activeIndex : itineraries.length > 0 ? 0 : -1
    if (index < 0) return null
    return itineraries[index].id || `trip-${index}`
  }, [itineraries])

  useEffect(() => {
    setSelectedTripId((prev) =>
      prev && tripOptions.some((opt) => opt.id === prev) ? prev : defaultTripId,
    )
  }, [tripOptions, defaultTripId])

  const packingInitial = useMemo(() => {
    const map = {}
    itineraries.forEach((item, index) => {
      const id = item.id || `trip-${index}`
      map[id] = Array.isArray(item.packingList) ? item.packingList : []
    })
    return map
  }, [itineraries])

  const budgetInitial = useMemo(() => {
    const map = {}
    itineraries.forEach((item, index) => {
      const id = item.id || `trip-${index}`
      map[id] = Array.isArray(item.budgetItems) ? item.budgetItems : []
    })
    return map
  }, [itineraries])

  const budgetCurrencyInitial = useMemo(() => {
    const map = {}
    itineraries.forEach((item, index) => {
      const id = item.id || `trip-${index}`
      map[id] = item.budgetCurrency || null
    })
    return map
  }, [itineraries])

  return (
    <div className="home-v2 trips-v2 min-h-screen flex flex-col">
      <HomeTopNav activePage="trips" />

      <div className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="hero-eyebrow">
              {language !== 'zh-CN' ? <div className="hero-eyebrow-dot" /> : null}
              <span className="hero-eyebrow-text">
                {displayName
                  ? translateTemplate(t, 'Logged in as {{name}}', { name: displayName })
                  : t('Your travel dashboard')}
              </span>
            </div>
            <h1 className="hero-headline">
              {tripsHeadline.map((segments, lineIndex) => (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  {segments.map((seg, segIndex) =>
                    seg.em ? (
                      <em key={segIndex}>{seg.text}</em>
                    ) : (
                      <Fragment key={segIndex}>{seg.text}</Fragment>
                    ),
                  )}
                </Fragment>
              ))}
            </h1>
            <p className="hero-sub">{heroSub}</p>
          </div>
          <Link to={isAuthenticated ? '/plan' : '/login'} className="btn-plan">
            <span className="material-symbols-outlined">add</span>{' '}
            {isAuthenticated ? t('Plan new trip') : t('Sign in to plan')}
          </Link>
        </div>
      </div>

      <div className="stats-strip">
        <div className="stats-inner">
          {stats.items.map((stat, i) => (
            <span key={stat.label} style={{ display: 'contents' }}>
              {i > 0 && <span className="stat-divider" aria-hidden="true" />}
              <div className="stat-item">
                <span className="stat-value">{isAuthenticated ? stat.value : '—'}</span>
                <span className="stat-label">{stat.label}</span>
              </div>
            </span>
          ))}
        </div>
      </div>

      <main className="page-wrap">

        {/* Join a friend's trip by code */}
        {isAuthenticated && (
          <section className="trips-section join-trip-section">
            <div className="section-head">
              <div>
                <p className="section-eyebrow">{t('Invited by a friend?')}</p>
                <h2 className="section-title">{t('Join a trip')}</h2>
              </div>
            </div>
            <div className="join-trip-card">
              <span className="material-symbols-outlined join-trip-icon">group_add</span>
              <p className="join-trip-desc">
                {t('Enter the 6-character invite code shared by your trip organizer.')}
              </p>
              <form
                className="join-trip-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  const code = joinCode.trim().toUpperCase()
                  if (code.length !== 6) { setJoinError(t('Please enter a valid 6-character code.')); return }
                  setJoinError('')
                  navigate(`/join/${code}`)
                }}
              >
                <input
                  ref={joinInputRef}
                  className="join-trip-input"
                  type="text"
                  maxLength={6}
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    setJoinError('')
                  }}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={t('Invite code')}
                />
                <button
                  type="submit"
                  className="join-trip-btn"
                  disabled={joinCode.trim().length === 0}
                >
                  {t('Join')}
                </button>
              </form>
              {joinError && <p className="join-trip-error">{joinError}</p>}
            </div>
          </section>
        )}

        <section className="trips-section">
          <div className="section-head">
            <div>
              <p className="section-eyebrow">{t('Saved itineraries')}</p>
              <h2 className="section-title">{t('All Trips')}</h2>
            </div>
            <div className="view-toggle">
              <button
                type="button"
                className={`view-btn${viewMode === 'grid' ? ' active' : ''}`}
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
              >
                <span className="material-symbols-outlined">grid_view</span>
              </button>
              <button
                type="button"
                className={`view-btn${viewMode === 'list' ? ' active' : ''}`}
                onClick={() => setViewMode('list')}
                aria-label="List view"
              >
                <span className="material-symbols-outlined">format_list_bulleted</span>
              </button>
            </div>
          </div>

          <div className={`trips-grid${viewMode === 'list' ? ' list-mode' : ''}`}>
            {!isAuthenticated && (
              <div className="trip-card-new" style={{ gridColumn: '1 / -1', cursor: 'default' }}>
                <span className="material-symbols-outlined">login</span>
                <span className="trip-card-new-label">{t('Sign in to view your trips')}</span>
                <span className="trip-card-new-sub">
                  {t('Your saved itineraries appear here after you sign in.')}{' '}
                  <Link to="/login" style={{ textDecoration: 'underline' }}>
                    {t('Log in')}
                  </Link>{' '}
                  {t('or')}{' '}
                  <Link to="/register" style={{ textDecoration: 'underline' }}>
                    {t('create an account')}
                  </Link>
                  .
                </span>
              </div>
            )}

            {isAuthenticated && !loading && tripCards.length === 0 && (
              <div className="trip-card-new" style={{ gridColumn: '1 / -1', cursor: 'default' }}>
                <span className="material-symbols-outlined">luggage</span>
                <span className="trip-card-new-label">{t('No trips saved yet')}</span>
                <span className="trip-card-new-sub">{t('Plan a trip and it will show up here.')}</span>
              </div>
            )}

            {tripCards.map((trip) => (
              <TripSummaryCard
                key={trip.id}
                to={trip.navState || trip.href}
                featured={trip.featured}
                badge={trip.badge}
                badgeLabel={trip.badgeLabel}
                dates={trip.dates}
                name={trip.name}
                meta={trip.meta}
              />
            ))}

            {isAuthenticated && (
              <Link to="/plan" className="trip-card-new">
                <span className="material-symbols-outlined">add_circle</span>
                <span className="trip-card-new-label">{t('Plan a new trip')}</span>
                <span className="trip-card-new-sub">{t('Let AI build your itinerary')}</span>
              </Link>
            )}
          </div>
        </section>


        <section className="trips-section">
          <div className="section-head">
            <div>
              <p className="section-eyebrow">{t('Trip tools')}</p>
              <h2 className="section-title">{t('Manage & Plan')}</h2>
            </div>
          </div>

          <div className="bento-grid">
            <div className="bento-card">
              <div className="bento-head">
                <h3 className="bento-title">{t('Packing List')}</h3>
                <div className="bento-icon">
                  <span className="material-symbols-outlined">backpack</span>
                </div>
              </div>
              {tripOptions.length > 0 ? (
                <>
                  <TripPicker
                    options={tripOptions}
                    value={selectedTripId}
                    onChange={setSelectedTripId}
                    t={t}
                  />
                  <PackingList
                    key={selectedTripId}
                    tripId={selectedTripId}
                    initialItems={packingInitial[selectedTripId] || []}
                  />
                </>
              ) : (
                <p className="dark-body" style={{ marginTop: 8 }}>
                  {t('Plan a trip to start a packing list.')}
                </p>
              )}
            </div>

            <div className="bento-card">
              <div className="bento-head">
                <h3 className="bento-title">{t('Trip Budget')}</h3>
                <div className="bento-icon">
                  <span className="material-symbols-outlined">account_balance_wallet</span>
                </div>
              </div>
              {tripOptions.length > 0 ? (
                <>
                  <TripPicker
                    options={tripOptions}
                    value={selectedTripId}
                    onChange={setSelectedTripId}
                    t={t}
                  />
                  <TripBudget
                    key={selectedTripId}
                    tripId={selectedTripId}
                    initialItems={budgetInitial[selectedTripId] || []}
                    initialDisplayCurrency={budgetCurrencyInitial[selectedTripId] || null}
                  />
                </>
              ) : (
                <p className="dark-body" style={{ marginTop: 8 }}>
                  {t('Plan a trip to track its budget.')}
                </p>
              )}
            </div>
          </div>
        </section>
      </main>

      <HomeFooter />
    </div>
  )
}
