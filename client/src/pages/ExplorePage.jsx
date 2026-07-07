import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import HomeFooter from '../components/home/HomeFooter.jsx'
import HomeTopNav from '../components/home/HomeTopNav.jsx'
import ExploreSocialIcons from '../components/explore/ExploreSocialIcons.jsx'
import SavePlaceToast from '../components/SavePlaceToast.jsx'
import TravelahLoader from '../components/TravelahLoader.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useTimedToast } from '../hooks/useTimedToast.js'
import { getPlaceImageUrl } from '../utils/resolveImage.js'
import {
  formatPlaceLikes,
  normalizeForTranslation,
  pickPlaceDescription,
  shouldTranslateDescription,
  shouldTranslatePlaceName,
} from '../utils/localizeContent.js'
import '../styles/home-v2.css'
import '../styles/explore-v2.css'
import '../styles/travelah-loader.css'

const FILTERS = ['ALL', 'FOOD', 'CULTURE', 'NATURE', 'HIDDEN GEMS', 'ADVENTURE', 'STAY']

const FILTER_LABELS = {
  ALL: 'All',
  FOOD: 'Food',
  CULTURE: 'Culture',
  NATURE: 'Nature',
  'HIDDEN GEMS': 'Hidden Gems',
  ADVENTURE: 'Adventure',
  STAY: 'Stay',
}

const MALAYSIA_STATES = [
  'ALL STATES',
  'Perlis',
  'Kedah',
  'Penang',
  'Perak',
  'Selangor',
  'Negeri Sembilan',
  'Melaka',
  'Johor',
  'Pahang',
  'Terengganu',
  'Kelantan',
  'Sabah',
  'Sarawak',
  'Kuala Lumpur',
  'Putrajaya',
  'Labuan',
]

const TRENDING_PILL_WIDTHS = [340, 320, 300, 280, 260]

const PAGE_SIZE = 9

const SORT_OPTIONS = [
  { value: 'trending', label: 'Trending now' },
  { value: 'posts', label: 'Most posts' },
  { value: 'name', label: 'Name A–Z' },
]

const PLATFORM_BADGES = {
  ig: { label: 'Instagram', icon: 'photo_camera' },
  xhs: { label: 'RedNote', icon: 'photo_camera' },
  dy: { label: 'TikTok', icon: 'music_note' },
}

function platformBadge(place) {
  const platforms = place.platforms || {}
  const active = Object.entries(platforms).filter(([, count]) => count > 0)

  if (active.length > 1) {
    return { label: 'Mixed', icon: 'layers' }
  }

  if (active.length === 1) {
    const key = active[0][0]
    return PLATFORM_BADGES[key] || PLATFORM_BADGES.xhs
  }

  const key = place.primaryPlatform || 'xhs'
  return PLATFORM_BADGES[key] || PLATFORM_BADGES.xhs
}

const EXPLORE_VIEW_KEY = 'travelahExploreView'

function saveExploreView(state) {
  sessionStorage.setItem(EXPLORE_VIEW_KEY, JSON.stringify(state))
}

function loadExploreView() {
  try {
    const raw = sessionStorage.getItem(EXPLORE_VIEW_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function readExploreRestore(locationState) {
  if (locationState?.resetExplore) {
    return null
  }

  if (locationState?.exploreRestore) {
    return locationState.exploreRestore
  }

  const snap = sessionStorage.getItem('exploreRestore')
  if (snap) {
    try {
      sessionStorage.removeItem('exploreRestore')
      return JSON.parse(snap)
    } catch {
      // ignore invalid cache
    }
  }

  return loadExploreView()
}

function rememberExplorePosition(state) {
  saveExploreView({ ...state, scrollY: window.scrollY })
}

function formatCategoryLabel(category) {
  if (!category) return 'Culture'
  return category
    .split(/[\s_]+/)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

function mapPlaceToCard(place, index) {
  const categories = place.categories?.length ? place.categories : ['CULTURE']
  const badge = platformBadge(place)
  return {
    id: place.id || place._id,
    rank: index + 1,
    rankLabel: String(index + 1).padStart(2, '0'),
    state: place.state || 'Malaysia',
    categories,
    image: getPlaceImageUrl(place.coverImage),
    title: place.name,
    description: place.description || '',
    googleDescription: place.googleDescription || '',
    likes: formatPlaceLikes(place),
    posts: place.postCount || 0,
    totalLikes: place.totalLikes || 0,
    source: badge.label,
    sourceIcon: badge.icon,
  }
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

function sortPlaceCards(cards, sort) {
  const items = [...cards]
  if (sort === 'posts') {
    return items.sort((a, b) => (b.posts || 0) - (a.posts || 0) || (b.totalLikes || 0) - (a.totalLikes || 0))
  }
  if (sort === 'name') {
    return items.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  }
  return items.sort((a, b) => (b.totalLikes || 0) - (a.totalLikes || 0) || (b.posts || 0) - (a.posts || 0))
}

function withRankLabels(cards) {
  return cards.map((card, index) => ({
    ...card,
    rank: index + 1,
    rankLabel: String(index + 1).padStart(2, '0'),
  }))
}

function ExploreStatePicker({ value, onChange }) {
  const { t, tState } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  function stateLabel(state) {
    return state === 'ALL STATES' ? t('All States') : tState(state)
  }

  useEffect(() => {
    if (!open) return undefined
    function onDocClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`sort-picker state-picker${open ? ' open' : ''}`} ref={ref}>
      <button
        type="button"
        className="sort-btn state-picker-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by state"
      >
        <span className="state-picker-value">{stateLabel(value)}</span>
        <span className="material-symbols-outlined">expand_more</span>
      </button>
      {open && (
        <ul className="sort-picker-menu state-picker-menu" role="listbox">
          {MALAYSIA_STATES.map((state) => (
            <li key={state}>
              <button
                type="button"
                role="option"
                aria-selected={state === value}
                className={`sort-picker-option${state === value ? ' selected' : ''}`}
                onClick={() => {
                  onChange(state)
                  setOpen(false)
                }}
              >
                <span>{stateLabel(state)}</span>
                {state === value && (
                  <span className="material-symbols-outlined sort-picker-check">check</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ExploreSortPicker({ value, onChange }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = SORT_OPTIONS.find((opt) => opt.value === value) || SORT_OPTIONS[0]

  useEffect(() => {
    if (!open) return undefined
    function onDocClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`sort-picker${open ? ' open' : ''}`} ref={ref}>
      <button
        type="button"
        className="sort-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {t(selected.label)}
        <span className="material-symbols-outlined">swap_vert</span>
      </button>
      {open && (
        <ul className="sort-picker-menu" role="listbox">
          {SORT_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`sort-picker-option${opt.value === value ? ' selected' : ''}`}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                <span>{t(opt.label)}</span>
                {opt.value === value && (
                  <span className="material-symbols-outlined sort-picker-check">check</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ExplorePlaceCard({ card, returnState, onSaveNotify }) {
  const { t, tPlaceName, tContent, tState, tCategory, language } = useLanguage()
  const { isAuthenticated, user, toggleSavedPlace } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [saveLoading, setSaveLoading] = useState(false)
  const badge = trendingBadge(card.rank)
  const saved = (user?.savedPlaces || []).some((item) => item.placeId === card.id)
  const primaryCategory = card.categories[0] || 'CULTURE'
  const categoryLabel = tCategory(primaryCategory)
  const description = pickPlaceDescription(card.description, card.googleDescription, language)

  async function handleToggleSave(event) {
    event.preventDefault()
    event.stopPropagation()

    if (!isAuthenticated) {
      navigate('/login', {
        state: { from: { pathname: `/explore/place/${card.id}` }, background: location },
      })
      return
    }

    if (saveLoading) return
    setSaveLoading(true)
    const wasSaved = saved
    try {
      await toggleSavedPlace(card.id, !saved)
      onSaveNotify?.(
        wasSaved
          ? { message: t('Removed from your profile'), icon: 'bookmark_remove' }
          : {
              message: t('Saved to your profile'),
              linkTo: '/profile',
              linkLabel: t('View'),
            },
      )
    } catch {
      // keep previous saved state on failure
    } finally {
      setSaveLoading(false)
    }
  }

  return (
    <Link
      to={`/explore/place/${card.id}`}
      state={{ from: '/explore', exploreRestore: returnState }}
      onMouseDown={() => rememberExplorePosition(returnState)}
      className="explore-place-card"
    >
      <div className="card-hero">
        {card.image ? (
          <img className="card-hero-img" src={card.image} alt={card.title} loading="lazy" />
        ) : (
          <div className="card-hero-img card-hero-placeholder">
            <span className="material-symbols-outlined">place</span>
          </div>
        )}

        <span className="card-hero-rank" aria-hidden="true">
          {card.rankLabel}
        </span>

        <span className="card-hero-cat">
          <span className="material-symbols-outlined">{categoryIcon(primaryCategory)}</span>
          {categoryLabel}
        </span>

        <button
          type="button"
          className={`card-hero-save${saved ? ' saved' : ''}`}
          onClick={handleToggleSave}
          onMouseDown={(event) => event.preventDefault()}
          disabled={saveLoading}
          aria-label={saved ? t('Unsave place') : t('Save place')}
          title={saved ? t('Saved') : t('Save')}
        >
          <span className="material-symbols-outlined">{saved ? 'bookmark' : 'bookmark_border'}</span>
        </button>

        <div className="card-hero-foot">
          <h3 className="card-hero-title">{tPlaceName(card.title)}</h3>
        </div>
      </div>

      <div className="card-footer-bar">
        <span className="explore-stat-item">
          <span className="material-symbols-outlined">favorite</span>
          {card.likes || '—'}
        </span>
        <span className="explore-stat-item">
          <span className="material-symbols-outlined">photo_library</span>
          {card.posts} {t('posts')}
        </span>
        {badge && (
          <span className="trending-badge">
            <span className="material-symbols-outlined">{badge.icon}</span>
            {t(badge.label)}
          </span>
        )}
      </div>

      <div className="card-body">
        {card.state ? (
          <span className="explore-badge badge-state">{tState(card.state)}</span>
        ) : null}
        {description ? (
          <p className="explore-card-desc">{tContent(description)}</p>
        ) : null}
      </div>
    </Link>
  )
}

function trendingBadge(rank) {
  if (rank <= 3) return { icon: 'trending_up', label: 'Hot' }
  if (rank <= 9) return { icon: 'trending_up', label: 'Rising' }
  return { icon: 'trending_flat', label: 'Steady' }
}

export default function ExplorePage() {
  const { ui, t, tPlaceName, queueDynamicTranslations, language, tState } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const bootstrapRef = useRef(null)
  if (bootstrapRef.current === null) {
    bootstrapRef.current = readExploreRestore(location.state)
  }

  const [activeFilter, setActiveFilter] = useState(
    () => bootstrapRef.current?.activeFilter ?? 'ALL',
  )
  const [activeState, setActiveState] = useState(
    () => bootstrapRef.current?.activeState ?? 'ALL STATES',
  )
  const [places, setPlaces] = useState([])
  const [topPlaces, setTopPlaces] = useState([])
  const [currentPage, setCurrentPage] = useState(
    () => bootstrapRef.current?.currentPage ?? 1,
  )
  const [searchInput, setSearchInput] = useState(
    () => bootstrapRef.current?.searchQuery ?? '',
  )
  const [searchQuery, setSearchQuery] = useState(
    () => bootstrapRef.current?.searchQuery ?? '',
  )
  const [activeSort, setActiveSort] = useState(
    () => bootstrapRef.current?.activeSort ?? 'trending',
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const prevFiltersRef = useRef({ activeFilter, activeState, searchQuery })
  const { toast: saveToast, showToast: showSaveToast } = useTimedToast()

  const goToFirstPage = () => {
    bootstrapRef.current = null
    setCurrentPage(1)
    window.scrollTo(0, 0)
  }

  useEffect(() => {
    if (!location.state?.resetExplore) return
    goToFirstPage()
    setSearchInput('')
    setSearchQuery('')
    saveExploreView({
      activeFilter,
      activeState,
      activeSort,
      currentPage: 1,
      searchQuery: '',
      scrollY: 0,
    })
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state?.resetExplore, activeFilter, activeState, location.pathname, navigate])

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    saveExploreView({
      activeFilter,
      activeState,
      activeSort,
      currentPage,
      searchQuery,
      scrollY: window.scrollY,
    })
  }, [activeFilter, activeState, activeSort, currentPage, searchQuery])

  useEffect(() => {
    let timer
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        saveExploreView({
          activeFilter,
          activeState,
          activeSort,
          currentPage,
          searchQuery,
          scrollY: window.scrollY,
        })
      }, 120)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(timer)
    }
  }, [activeFilter, activeState, activeSort, currentPage, searchQuery])

  useEffect(() => {
    let cancelled = false
    fetch('/api/places?limit=5&state=ALL%20STATES&category=ALL')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setTopPlaces(data.map((p, i) => mapPlaceToCard(p, i)))
      })
      .catch(() => {
        if (!cancelled) setTopPlaces([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const filtersChanged =
      prevFiltersRef.current.activeFilter !== activeFilter ||
      prevFiltersRef.current.activeState !== activeState ||
      prevFiltersRef.current.searchQuery !== searchQuery
    prevFiltersRef.current = { activeFilter, activeState, searchQuery }

    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      limit: '200',
      state: activeState,
      category: activeFilter,
    })
    if (searchQuery) params.set('q', searchQuery)
    fetch(`/api/places?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load places')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setPlaces(data.map((p, i) => mapPlaceToCard(p, i)))

          if (bootstrapRef.current) {
            const scrollY = bootstrapRef.current.scrollY ?? 0
            bootstrapRef.current = null
            if (scrollY > 0) {
              requestAnimationFrame(() => window.scrollTo(0, scrollY))
            }
          } else if (filtersChanged) {
            setCurrentPage(1)
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeFilter, activeState, searchQuery])

  useEffect(() => {
    const texts = new Set()
    for (const card of places) {
      if (shouldTranslatePlaceName(card.title, language)) texts.add(card.title)
      const desc = pickPlaceDescription(card.description, card.googleDescription, language)
      const descNorm = desc ? normalizeForTranslation(desc) : ''
      if (descNorm && shouldTranslateDescription(desc, language)) texts.add(descNorm)
    }
    for (const card of topPlaces) {
      if (shouldTranslatePlaceName(card.title, language)) texts.add(card.title)
    }
    if (texts.size) queueDynamicTranslations(Array.from(texts))
  }, [places, topPlaces, language, queueDynamicTranslations])

  const sortedPlaces = useMemo(
    () => withRankLabels(sortPlaceCards(places, activeSort)),
    [places, activeSort],
  )

  const placeReturnState = {
    activeFilter,
    activeState,
    activeSort,
    currentPage,
    searchQuery,
  }

  const totalPages = Math.max(1, Math.ceil(sortedPlaces.length / PAGE_SIZE))
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pagedPlaces = sortedPlaces.slice(pageStart, pageStart + PAGE_SIZE)

  const pageNumbers = (() => {
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
  })()

  return (
    <div className="home-v2 explore-v2">
      <HomeTopNav activePage="explore" />

      <div className="explore-page">
        <section className="explore-hero">
          <div className="hero-left">
            <div className="hero-eyebrow">
              <div className="hero-eyebrow-dot" />
              <span className="hero-eyebrow-text">{ui.exploreHeroEyebrow}</span>
            </div>
            <h1 className="explore-hero-headline">
              {ui.exploreHeroPulse}
              <br />
              {ui.exploreHeroOf} <em>{ui.exploreHeroMalaysia}</em>
            </h1>
            <p className="explore-hero-sub">
              {ui.exploreHeroSub}
            </p>
            <ExploreSocialIcons />
          </div>

          <div className="explore-hero-right">
            {topPlaces.map((place, index) => (
              <Link
                key={place.id}
                to={`/explore/place/${place.id}`}
                state={{ from: '/explore', exploreRestore: placeReturnState }}
                onMouseDown={() => rememberExplorePosition(placeReturnState)}
                className="trending-pill"
                style={{ width: TRENDING_PILL_WIDTHS[index] || 260 }}
              >
                <span className="tp-rank">{place.rankLabel}</span>
                <span className="tp-name">{tPlaceName(place.title)}</span>
                <span className="tp-tag">{formatCategoryLabel(place.categories[0])}</span>
                <span className="tp-stat">
                  <span className="material-symbols-outlined">favorite</span>
                  {place.likes}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <div className="explore-search-row">
          <div className="explore-search">
            <span className="material-symbols-outlined" aria-hidden="true">
              search
            </span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => {
                goToFirstPage()
                setSearchInput(e.target.value)
              }}
              placeholder={ui.exploreSearchPlaceholder}
              aria-label={ui.exploreSearchPlaceholder}
            />
            {searchInput && (
              <button
                type="button"
                className="explore-search-clear"
                onClick={() => {
                  goToFirstPage()
                  setSearchInput('')
                  setSearchQuery('')
                }}
                aria-label="Clear search"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-left">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`filter-btn${activeFilter === filter ? ' active' : ''}`}
                onClick={() => {
                  goToFirstPage()
                  setActiveFilter(filter)
                }}
              >
                {t(FILTER_LABELS[filter])}
              </button>
            ))}
          </div>
          <div className="filter-right">
            <ExploreStatePicker
              value={activeState}
              onChange={(nextState) => {
                goToFirstPage()
                setActiveState(nextState)
              }}
            />
            <ExploreSortPicker
              value={activeSort}
              onChange={(nextSort) => {
                goToFirstPage()
                setActiveSort(nextSort)
              }}
            />
          </div>
        </div>

        {!loading && !error && sortedPlaces.length > 0 && (
          <p className="result-count">
            {t('Showing')} <span>{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, sortedPlaces.length)}</span> {t('showingOf')}{' '}
            <span>{sortedPlaces.length}</span> {t('places')}
          </p>
        )}

        {loading ? (
          <div className="explore-loader-wrap">
            <TravelahLoader label={ui.loadingTrending || 'Loading places'} />
          </div>
        ) : error ? (
          <p className="explore-status">
            Could not load places. Run <code>python nlp/extract_places.py</code> and{' '}
            <code>npm run seed:places</code> in server.
          </p>
        ) : sortedPlaces.length === 0 ? (
          <p className="explore-status">
            {searchQuery ? ui.exploreNoSearchResults : t('No places for this filter yet. Try another state or category.')}
          </p>
        ) : (
          <>
            <section className="cards-grid">
              {pagedPlaces.map((card) => (
                <ExplorePlaceCard
                  key={card.id}
                  card={card}
                  returnState={placeReturnState}
                  onSaveNotify={showSaveToast}
                />
              ))}
            </section>

            <div className="explore-pagination">
              <span className="page-info">
                {t('Page')} {currentPage} {t('pageOf')} {totalPages}
              </span>
              <div className="page-controls">
                <button
                  type="button"
                  className="page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  ← {t('Prev')}
                </button>
                {pageNumbers.map((page, index) =>
                  page === '…' ? (
                    <span key={`ellipsis-${index}`} style={{ color: 'var(--muted)', fontSize: 13 }}>
                      …
                    </span>
                  ) : (
                    <button
                      key={page}
                      type="button"
                      className={`page-btn${currentPage === page ? ' current' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t('Next')} →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <HomeFooter />
      <SavePlaceToast toast={saveToast} />
    </div>
  )
}
