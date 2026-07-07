import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import HomeTopNav from '../components/home/HomeTopNav.jsx'
import HomeFooter from '../components/home/HomeFooter.jsx'
import TravelahLoader from '../components/TravelahLoader.jsx'
import SavePlaceToast from '../components/SavePlaceToast.jsx'
import AddToItineraryButton from '../components/AddToItineraryButton.jsx'
import AddToItineraryConfirmModal from '../components/AddToItineraryConfirmModal.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useTimedToast } from '../hooks/useTimedToast.js'
import { useAddToItinerary } from '../hooks/useAddToItinerary.js'
import { shouldTranslateDescription, shouldTranslatePlaceName } from '../utils/localizeContent.js'
import { getPlaceImageUrl } from '../utils/resolveImage.js'
import '../styles/home-v2.css'
import '../styles/heritage-v2.css'

const MALAYSIA_CENTER = [4.2105, 109.5]
const DEFAULT_ZOOM = 6
const PER_PAGE = 6

function heritageIcon(active) {
  return L.divIcon({
    className: 'heritage-leaflet-icon',
    html: `<span class="heritage-pin${active ? ' is-active' : ''}"><span class="heritage-pin-dot"></span></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

export default function HeritagePage() {
  const { t, tPlaceName, tContent, tState, queueDynamicTranslations, language } = useLanguage()
  const { user, isAuthenticated, toggleSavedPlace } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [sites, setSites] = useState([])
  const [status, setStatus] = useState('loading')
  const [filter, setFilter] = useState('ALL')
  const [activeId, setActiveId] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [page, setPage] = useState(1)
  const { toast: saveToast, showToast: showSaveToast } = useTimedToast()
  const {
    addToItinerary,
    confirmAdd,
    cancelConfirm,
    confirm,
    loading: itineraryLoading,
    toast: itineraryToast,
  } = useAddToItinerary()
  const actionToast = itineraryToast || saveToast

  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const topRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/heritage')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return
        setSites(Array.isArray(data) ? data : [])
        setStatus(Array.isArray(data) && data.length ? 'ready' : 'empty')
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const texts = new Set()
    for (const site of sites) {
      if (shouldTranslatePlaceName(site.name, language)) texts.add(site.name)
      if (shouldTranslateDescription(site.description, language)) texts.add(site.description)
      if (site.type && language !== 'en') texts.add(site.type)
    }
    if (texts.size) queueDynamicTranslations(Array.from(texts))
  }, [sites, language, queueDynamicTranslations])

  const states = useMemo(() => {
    const set = new Set(sites.map((s) => s.state).filter(Boolean))
    return ['ALL', ...Array.from(set).sort()]
  }, [sites])

  const visibleSites = useMemo(
    () => (filter === 'ALL' ? sites : sites.filter((s) => s.state === filter)),
    [sites, filter],
  )

  const savedIds = useMemo(
    () => new Set((user?.savedPlaces || []).map((s) => s.placeId)),
    [user],
  )

  const pageCount = Math.max(1, Math.ceil(visibleSites.length / PER_PAGE))
  const pagedSites = useMemo(
    () => visibleSites.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [visibleSites, page],
  )

  const pageNumbers = useMemo(() => {
    if (pageCount <= 5) {
      return Array.from({ length: pageCount }, (_, i) => i + 1)
    }
    const pages = [1]
    if (page > 3) pages.push('…')
    for (let p = Math.max(2, page - 1); p <= Math.min(pageCount - 1, page + 1); p += 1) {
      if (!pages.includes(p)) pages.push(p)
    }
    if (page < pageCount - 2) pages.push('…')
    if (!pages.includes(pageCount)) pages.push(pageCount)
    return pages
  }, [page, pageCount])

  useEffect(() => {
    if (page > pageCount) setPage(1)
  }, [pageCount, page])

  function goToPage(next) {
    setPage(Math.max(1, Math.min(pageCount, next)))
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Create the Leaflet map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(
      MALAYSIA_CENTER,
      DEFAULT_ZOOM,
    )
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    const timers = [150, 450, 900].map((ms) => setTimeout(() => map.invalidateSize(), ms))
    return () => {
      timers.forEach(clearTimeout)
      map.remove()
      mapRef.current = null
    }
    // Runs again once status flips to 'ready' and the map container is in the DOM.
  }, [status])

  // (Re)draw markers when the visible sites change.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = new Map()
    if (!visibleSites.length) return

    const latLngs = []
    visibleSites.forEach((site) => {
      if (typeof site.lat !== 'number' || typeof site.lng !== 'number') return
      const marker = L.marker([site.lat, site.lng], { icon: heritageIcon(false) })
      marker.bindPopup(`<strong>${tPlaceName(site.name)}</strong><br>${tState(site.state)}`)
      marker.on('click', () => setActiveId(site.id))
      marker.addTo(map)
      markersRef.current.set(site.id, marker)
      latLngs.push([site.lat, site.lng])
    })
    if (!latLngs.length) return

    // Size the container first, THEN fit — otherwise Leaflet computes the zoom
    // against a wrong (often tiny) container size and shows half of Asia.
    const bounds = L.latLngBounds(latLngs).pad(0.1)
    const fit = () => {
      map.invalidateSize()
      map.fitBounds(bounds, { maxZoom: 11, animate: false })
    }
    fit()
    const timers = [200, 500, 900].map((ms) => setTimeout(fit, ms))
    return () => timers.forEach(clearTimeout)
  }, [visibleSites, tPlaceName, tState])

  // Fly to the active site.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !activeId) return
    const site = sites.find((s) => s.id === activeId)
    const marker = markersRef.current.get(activeId)
    if (site && typeof site.lat === 'number') {
      map.flyTo([site.lat, site.lng], 14, { duration: 0.8 })
      marker?.openPopup()
    }
  }, [activeId, sites])

  function focusSite(site) {
    setActiveId(site.id)
    if (window.innerWidth <= 900) {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  async function handleSave(site, event) {
    event?.stopPropagation()

    if (!isAuthenticated) {
      navigate('/login', { state: { background: location } })
      return
    }
    if (savingId) return

    const wasSaved = savedIds.has(site.id)
    setSavingId(site.id)
    try {
      await toggleSavedPlace(site.id, !wasSaved)
      showSaveToast(
        wasSaved
          ? { message: t('Removed from your profile'), icon: 'bookmark_remove' }
          : {
              message: t('Saved to your profile'),
              linkTo: '/profile',
              linkLabel: t('View'),
            },
      )
    } catch {
      /* ignore */
    } finally {
      setSavingId(null)
    }
  }

  if (status === 'loading') {
    return (
      <div className="home-v2 heritage-v2 heritage-loading-screen">
        <HomeTopNav activePage="heritage" />
        <TravelahLoader label={t('Loading heritage sites')} />
      </div>
    )
  }

  return (
    <div className="home-v2 heritage-v2">
      <HomeTopNav activePage="heritage" />

      <section className="heritage-hero">
        <span className="heritage-eyebrow">{t("Malaysia's living heritage")}</span>
        <h1 className="heritage-title">
          {t('Places that')} <em>{t('made')}</em> {t('Malaysia.')}
        </h1>
        <p className="heritage-sub">
          {t(
            'UNESCO World Heritage Sites, forts, temples and mosques worth the trip — explore them on the map and save the ones you want to visit.',
          )}
        </p>
      </section>

      <div className="heritage-filters" ref={topRef}>
        {states.map((s) => (
          <button
            key={s}
            type="button"
            className={`heritage-filter${filter === s ? ' is-active' : ''}`}
            onClick={() => {
              setFilter(s)
              setPage(1)
            }}
          >
            {s === 'ALL' ? t('All states') : tState(s)}
          </button>
        ))}
      </div>

      <div className="heritage-body">
        <div className="heritage-list">
          {status === 'loading' && <p className="heritage-status">{t('Loading heritage sites…')}</p>}
          {status === 'error' && <p className="heritage-status">{t('Could not load heritage sites.')}</p>}
          {status === 'ready' &&
            pagedSites.map((site) => {
              const saved = savedIds.has(site.id)
              const img = getPlaceImageUrl(site.coverImage)
              return (
                <article
                  key={site.id}
                  className={`heritage-card${activeId === site.id ? ' is-active' : ''}`}
                  onClick={() => focusSite(site)}
                >
                  <div className="heritage-card-media">
                    {img ? (
                      <img src={img} alt={tPlaceName(site.name)} loading="lazy" />
                    ) : (
                      <div className="heritage-card-placeholder">
                        <span className="material-symbols-outlined">account_balance</span>
                      </div>
                    )}
                    {site.unescoYear && <span className="heritage-unesco">UNESCO · {site.unescoYear}</span>}
                  </div>

                  <div className="heritage-card-body">
                    <div className="heritage-card-head">
                      <div className="heritage-card-meta">
                        <span className="heritage-card-state">
                          <span className="material-symbols-outlined">location_on</span>
                          {tState(site.state)}
                        </span>
                        <span className="heritage-card-type">{t(site.type)}</span>
                      </div>
                      <button
                        type="button"
                        className={`heritage-card-save${saved ? ' saved' : ''}`}
                        onClick={(e) => handleSave(site, e)}
                        onMouseDown={(e) => e.preventDefault()}
                        disabled={savingId === site.id}
                        aria-label={saved ? t('Unsave place') : t('Save place')}
                        title={saved ? t('Saved') : t('Save')}
                      >
                        <span className="material-symbols-outlined">
                          {saved ? 'bookmark' : 'bookmark_border'}
                        </span>
                      </button>
                    </div>
                    <h3 className="heritage-card-name">{tPlaceName(site.name)}</h3>
                    <p className="heritage-card-desc">{tContent(site.description)}</p>
                    <div className="heritage-card-actions">
                      <AddToItineraryButton
                        className="heritage-map-btn"
                        loading={itineraryLoading}
                        onAdd={() => addToItinerary(site)}
                      />
                    </div>
                  </div>
                </article>
              )
            })}

          {status === 'ready' && pageCount > 1 && (
            <div className="heritage-pagination">
              <span className="page-info">
                {t('Page')} {page} {t('pageOf')} {pageCount}
              </span>
              <div className="page-controls">
                <button
                  type="button"
                  className="page-btn"
                  disabled={page === 1}
                  onClick={() => goToPage(page - 1)}
                >
                  ← {t('Prev')}
                </button>
                {pageNumbers.map((pageNum, index) =>
                  pageNum === '…' ? (
                    <span key={`ellipsis-${index}`} className="page-ellipsis">
                      …
                    </span>
                  ) : (
                    <button
                      key={pageNum}
                      type="button"
                      className={`page-btn${page === pageNum ? ' current' : ''}`}
                      onClick={() => goToPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="page-btn"
                  disabled={page === pageCount}
                  onClick={() => goToPage(page + 1)}
                >
                  {t('Next')} →
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="heritage-map-wrap">
          <div ref={containerRef} className="heritage-map" aria-label="Map of Malaysian heritage sites" />
        </div>
      </div>

      <HomeFooter />
      <AddToItineraryConfirmModal
        confirm={confirm}
        loading={itineraryLoading}
        onConfirm={confirmAdd}
        onCancel={cancelConfirm}
      />
      <SavePlaceToast toast={actionToast} />
    </div>
  )
}
