import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import HomeFooter from '../components/home/HomeFooter.jsx'
import HomeTopNav from '../components/home/HomeTopNav.jsx'
import TrendingSection from '../components/TrendingSection.jsx'
import ConciergeThread from '../components/concierge/ConciergeThread.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getHeroHeadline } from '../i18n/hero-headline.js'
import { resolvePublicAssetUrl } from '../utils/resolveImage.js'
import '../styles/home-v2.css'

const HERO_TILES = [
  {
    label: 'Kuala Lumpur',
    alt: 'Kuala Lumpur Petronas Towers',
    src: resolvePublicAssetUrl('/images/kuala-lumpur.png?v=2'),
    tall: true,
    objectPosition: 'center top',
  },
  {
    label: 'Penang',
    alt: 'Penang George Town heritage street',
    src: resolvePublicAssetUrl('/images/penang.png?v=2'),
    objectPosition: 'center center',
    row: 1,
    col: 2,
  },
  {
    label: 'Sabah',
    alt: 'Sabah',
    src: resolvePublicAssetUrl('/images/sabah.jpg'),
    row: 2,
    col: 2,
  },
]

const HERO_TAGS = ['Langkawi', 'Penang', 'Kuching', 'Cameron Highlands', 'Melaka']

const MARQUEE_ITEMS = [
  'Explore Malaysia',
  'Local Intelligence',
  'Real Reviews',
  'Hidden Gems',
  'Kuala Lumpur',
  'Penang Heritage',
  'Sabah Wildlife',
  'AI Planner',
]

const DEFAULT_STATS = [
  { num: '—', label: 'Local posts indexed' },
  { num: '—', label: 'Malaysian states' },
  { num: '—', label: 'Federal territories' },
  { num: '—', label: 'Social platforms' },
]

function formatCompactCount(count) {
  const n = Number(count) || 0
  if (n >= 1000) {
    const k = Math.round((n / 1000) * 10) / 10
    const text = Number.isInteger(k) ? String(k) : k.toFixed(1)
    return `${text}K+`
  }
  return String(n)
}

// Split a stat like "14K+" into a leading prefix, the number, and a suffix so
// only the numeric part counts up while "K+" etc. stay put.
function parseStatValue(raw) {
  const match = String(raw).match(/^(\D*)([\d.]+)(.*)$/)
  if (!match) return { prefix: '', value: null, suffix: String(raw), decimals: 0 }
  const [, prefix, numStr, suffix] = match
  const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0
  return { prefix, value: Number.parseFloat(numStr), suffix, decimals }
}

// Animates the number from 0 to its target when `start` flips true.
function StatNumber({ raw, start }) {
  const { prefix, value, suffix, decimals } = useMemo(() => parseStatValue(raw), [raw])
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!start || value === null) return undefined
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setDisplay(value)
      return undefined
    }
    let frame
    const duration = 1400
    const startTime = performance.now()
    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
      setDisplay(value * eased)
      if (progress < 1) frame = requestAnimationFrame(tick)
      else setDisplay(value)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [start, value])

  if (value === null) return <span className="stat-num">{raw}</span>
  const shown = decimals > 0 ? Number(display).toFixed(decimals) : Math.round(display)
  return (
    <span className="stat-num">
      {prefix}
      {shown}
      {suffix}
    </span>
  )
}

export default function HomePage() {
  const { ui, t, language } = useLanguage()
  const heroLines = getHeroHeadline(language)
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [stats, setStats] = useState(DEFAULT_STATS)
  const searchRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setStats([
          { num: formatCompactCount(data.postCount), label: 'Local posts indexed' },
          { num: String(data.stateCount ?? 0), label: 'Malaysian states' },
          { num: String(data.federalTerritoryCount ?? 0), label: 'Federal territories' },
          { num: String(data.platformCount ?? 0), label: 'Social platforms' },
        ])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Trigger the stat count-up once the strip scrolls into view.
  const statStripRef = useRef(null)
  const [statsStarted, setStatsStarted] = useState(false)
  useEffect(() => {
    const el = statStripRef.current
    if (!el || statsStarted) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsStarted(true)
          observer.disconnect()
        }
      },
      { threshold: 0.4 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [statsStarted])

  function goToExplore(query) {
    navigate('/explore', {
      state: {
        exploreRestore: {
          searchQuery: query || '',
          activeFilter: 'ALL',
          activeState: 'ALL STATES',
          currentPage: 1,
          scrollY: 0,
        },
      },
    })
  }

  function handleSearchSubmit(e) {
    e.preventDefault()
    goToExplore(searchInput.trim())
  }

  return (
    <div className="home-v2">
      <HomeTopNav />

      <section className="home-hero">
        <div className="hero-left">
          <div className="hero-eyebrow">
            <div className="hero-eyebrow-dot" />
            <span className="hero-eyebrow-text">{t("Malaysia's travel intelligence")}</span>
          </div>

          <h1 className="hero-headline">
            {heroLines.map((segments, lineIndex) => (
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

          <p className="hero-sub">{ui.heroSubtitle}</p>

          <form className="hero-search" onSubmit={handleSearchSubmit}>
            <span className="material-symbols-outlined" style={{ color: 'var(--sand)', marginRight: 4 }}>
              search
            </span>
            <input
              ref={searchRef}
              type="text"
              placeholder={ui.searchPlaceholder}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className="btn-pill">
              {ui.exploreBtn}
            </button>
          </form>

          <div className="hero-tags">
            {HERO_TAGS.map((label) => (
              <button key={label} type="button" className="tag" onClick={() => goToExplore(label)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="hero-right">
          {HERO_TILES.map((tile) => (
            <div
              key={tile.label}
              className={`hero-tile${tile.tall ? ' hero-tile-tall' : ''}`}
              style={
                tile.tall
                  ? { gridRow: '1 / 3', gridColumn: '1' }
                  : { gridRow: tile.row, gridColumn: tile.col }
              }
            >
              <img
                src={tile.src}
                alt={tile.alt}
                loading="eager"
                style={tile.objectPosition ? { objectPosition: tile.objectPosition } : undefined}
              />
              <div className="tile-label">{tile.label}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="stat-strip" ref={statStripRef}>
        {stats.map((stat, index) => (
          <Fragment key={stat.label}>
            {index > 0 && <div className="stat-divider" />}
            <div className="stat-item">
              <StatNumber raw={stat.num} start={statsStarted} />
              <span className="stat-label">{t(stat.label)}</span>
            </div>
          </Fragment>
        ))}
      </div>

      <div className="marquee-section" aria-hidden="true">
        <div className="marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, index) => (
            <span key={`${item}-${index}`} className="marquee-item">
              <span className="marquee-dot" />
              {item}
            </span>
          ))}
        </div>
      </div>

      <TrendingSection variant="bento" />

      <section className="planner-section" id="plan">
        <div className="planner-inner">
          <div className="planner-left">
            <span className="planner-eyebrow-badge">{t('AI Concierge')}</span>
            <h2 className="planner-headline">
              {t('Your trip,')}
              <br />
              <em>{t('your language,')}</em>
              <br />
              {t('your people.')}
            </h2>
            <p className="planner-sub">
              {t(
                'Tell us your vibe in Malay, Chinese, or English. We pull from thousands of real social posts to build an itinerary that actually fits how you travel.',
              )}
            </p>
            <div className="planner-actions">
              <Link to="/plan" className="btn-lime">
                {t('Start planning')}
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  east
                </span>
              </Link>
            </div>
          </div>

          <div className="planner-right">
            <div className="ai-chat">
              <div className="ai-chat-head">
                <span className="ai-chat-badge">
                  <span className="ai-chat-dot" />
                  {t('Travelah AI')}
                </span>
                <span className="ai-chat-model">{t('Powered by Gemini')}</span>
              </div>

              <ConciergeThread />
            </div>
          </div>
        </div>
      </section>

      <div className="testimonial-section">
        <blockquote className="testimonial-q">
          &ldquo;{t('See Malaysia the way locals do — guided by thousands of real voices, not tourist brochures.')}&rdquo;
        </blockquote>
      </div>

      <HomeFooter />
    </div>
  )
}
