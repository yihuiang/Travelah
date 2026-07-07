import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getPlaceImageUrl, getPostImageUrl } from '../utils/resolveImage.js'
import {
  formatPlaceLikes,
  shouldTranslateDescription,
  shouldTranslatePlaceName,
  shouldTranslateCategory,
  pickDisplayCategory,
  normalizeForTranslation,
} from '../utils/localizeContent.js'

const BENTO_CLASSES = ['bento-card-a', 'bento-card-b', 'bento-card-c', 'bento-card-d', 'bento-card-e']

function resolveCategory(item) {
  return pickDisplayCategory(item.placeCategories || item.categories, item.category)
}

function TrendingCard({ item, rank, featured = false }) {
  const { tContent } = useLanguage()
  const rankLabel = String(rank).padStart(2, '0')
  const imageSrc = getPostImageUrl(item)
  const title = tContent(item.title || '')
  const description = tContent(item.description || '')
  const CardWrapper = item.noteUrl ? 'a' : 'article'
  const wrapperProps = item.noteUrl
    ? { href: item.noteUrl, target: '_blank', rel: 'noopener noreferrer' }
    : {}

  if (featured) {
    return (
      <CardWrapper
        {...wrapperProps}
        className="md:col-span-7 group cursor-pointer block"
      >
        <div className="relative overflow-hidden aspect-[4/5] md:aspect-[3/4] rounded-lg mb-6 shadow-[0px_4px_20px_rgba(44,44,44,0.05)]">
          {imageSrc ? (
            <img
              alt={title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              src={imageSrc}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-surface-container" />
          )}
          <div className="absolute top-8 left-8 bg-surface/90 backdrop-blur-sm px-4 py-2 rounded-full">
            <span className="font-label-caps text-primary">{rankLabel}</span>
          </div>
          {item.noteUrl && (
            <div className="absolute bottom-8 right-8">
              <div className="bg-primary text-on-primary p-4 rounded-full shadow-lg">
                <span className="material-symbols-outlined">share</span>
              </div>
            </div>
          )}
        </div>
        <h3 className="font-headline-md text-headline-md text-on-surface mb-2 line-clamp-2">{title}</h3>
        <p className="font-body-md text-on-surface-variant line-clamp-3">{description}</p>
      </CardWrapper>
    )
  }

  return (
    <CardWrapper {...wrapperProps} className="group cursor-pointer block">
      <div className="relative overflow-hidden aspect-[16/9] rounded-lg mb-4 shadow-[0px_4px_20px_rgba(44,44,44,0.05)]">
        {imageSrc ? (
          <img
            alt={title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            src={imageSrc}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-surface-container" />
        )}
        <div className="absolute top-4 left-4 bg-surface/90 backdrop-blur-sm px-3 py-1 rounded-full">
          <span className="font-label-caps text-primary">{rankLabel}</span>
        </div>
      </div>
      <h4 className="font-body-lg font-bold text-on-surface mb-1 line-clamp-2">{title}</h4>
      <p className="font-body-md text-on-surface-variant line-clamp-2">{description}</p>
    </CardWrapper>
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

function BentoCard({ item, rank, bentoClass }) {
  const { t, tPlaceName, tContent, tCategory, tState } = useLanguage()
  const rankLabel = String(rank).padStart(2, '0')
  const imageSrc = getPlaceImageUrl(item.placeCoverImage)
  const likes = formatPlaceLikes(item)
  const postCount = item.placePostCount ?? item.postCount ?? 1
  const badge = trendingBadge(rank)
  const rawPlaceName = String(item.placeName || '').trim()
  if (!rawPlaceName) return null

  const placeName = tPlaceName(rawPlaceName)
  const description = tContent(item.placeDescription || item.description || '')
  const primaryCategory = resolveCategory(item)
  const categoryLabel = tCategory(primaryCategory)

  const CardWrapper = item.placeId ? Link : item.noteUrl ? 'a' : 'article'
  const wrapperProps = item.placeId
    ? { to: `/explore/place/${item.placeId}` }
    : item.noteUrl
      ? { href: item.noteUrl, target: '_blank', rel: 'noopener noreferrer' }
      : {}

  return (
    <CardWrapper {...wrapperProps} className={`bento-card bento-place-card ${bentoClass}`}>
      <div className="card-hero">
        {imageSrc ? (
          <img className="card-hero-img" alt={placeName} src={imageSrc} loading="lazy" />
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

        <div className="card-hero-foot">
          <h3 className="card-hero-title">{placeName}</h3>
        </div>
      </div>

      <div className="card-footer-bar">
        <span className="explore-stat-item">
          <span className="material-symbols-outlined">favorite</span>
          {likes || '—'}
        </span>
        <span className="explore-stat-item">
          <span className="material-symbols-outlined">photo_library</span>
          {postCount} {t('posts')}
        </span>
        {badge && (
          <span className="trending-badge">
            <span className="material-symbols-outlined">{badge.icon}</span>
            {t(badge.label)}
          </span>
        )}
      </div>

      <div className="card-body">
        {item.state ? (
          <span className="explore-badge badge-state">{tState(item.state)}</span>
        ) : null}
        {description ? <p className="explore-card-desc">{description}</p> : null}
      </div>
    </CardWrapper>
  )
}

export default function TrendingSection({ variant = 'magazine' }) {
  const { language, ui, t, queueDynamicTranslations } = useLanguage()
  const [trending, setTrending] = useState([])
  const [status, setStatus] = useState('loading')
  const limit = variant === 'bento' ? 5 : 3

  useEffect(() => {
    async function loadTrending() {
      setStatus('loading')
      try {
        const withPlace = variant === 'bento' ? '&withPlace=1' : ''
        const res = await fetch(
          `/api/trending?limit=${limit}&lang=${encodeURIComponent(language)}${withPlace}`,
        )
        if (!res.ok) throw new Error('Failed to load trending')
        const data = await res.json()
        setTrending(data)
        setStatus(data.length ? 'ready' : 'empty')
      } catch {
        setStatus('error')
      }
    }
    loadTrending()
  }, [language, limit, variant])

  useEffect(() => {
    if (!trending.length) return
    const texts = new Set()
    for (const item of trending) {
      const name = String(item.placeName || '').trim()
      if (name && shouldTranslatePlaceName(name, language)) texts.add(name)
      const desc = item.placeDescription || item.description || ''
      const descNorm = desc ? normalizeForTranslation(desc) : ''
      if (descNorm && shouldTranslateDescription(desc, language)) texts.add(descNorm)
      if (item.title && shouldTranslateDescription(item.title, language)) texts.add(item.title)
      const cat = resolveCategory(item)
      if (cat && shouldTranslateCategory(cat, language)) texts.add(cat)
    }
    if (texts.size) queueDynamicTranslations(Array.from(texts))
  }, [trending, language, queueDynamicTranslations])

  const [featured, second, third] = trending
  const isBento = variant === 'bento'

  return (
    <section id="explore" className={isBento ? 'home-section' : 'w-full mb-32'}>
      <div className={isBento ? 'section-header' : 'flex items-end justify-between mb-12'}>
        <div>
          <span className={isBento ? 'section-eyebrow' : 'font-label-caps text-secondary-container block mb-2 uppercase tracking-widest'}>
            {isBento ? t('Curated from TikTok & RedNote') : ui.curatedDiscoveries}
          </span>
          <h2 className={isBento ? 'section-title' : 'font-headline-lg text-headline-lg text-primary'}>
            {isBento ? (
              <>
                {t('What locals')}
                <br />
                {t('are saying')}
              </>
            ) : (
              ui.whatsTrending
            )}
          </h2>
        </div>
        <Link
          to="/explore"
          className={
            isBento
              ? 'section-link'
              : 'font-label-caps text-on-surface-variant border-b border-outline-variant pb-1 hover:text-primary transition-colors'
          }
        >
          {isBento ? t('Full directory →') : ui.exploreFullDirectory}
        </Link>
      </div>

      {status === 'loading' && (
        <p className={isBento ? 'home-status' : 'text-on-surface-variant font-body-md'}>
          {ui.translating || ui.loadingTrending}
        </p>
      )}
      {status === 'error' && (
        <p className={isBento ? 'home-status' : 'text-on-surface-variant font-body-md'}>
          Could not load trending data. Start the API with{' '}
          <code className={isBento ? '' : 'text-primary'}>npm run dev:server</code>.
        </p>
      )}
      {status === 'empty' && (
        <p className={isBento ? 'home-status' : 'text-on-surface-variant font-body-md'}>
          No trending posts available yet.
        </p>
      )}

      {status === 'ready' && isBento && (
        <div className="bento">
          {trending.map((item, index) => (
            <BentoCard
              key={item.id || index}
              item={item}
              rank={index + 1}
              bentoClass={BENTO_CLASSES[index] || 'bento-card-c'}
            />
          ))}
        </div>
      )}

      {status === 'ready' && !isBento && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
          <TrendingCard item={featured} rank={1} featured />
          <div className="md:col-span-5 flex flex-col gap-gutter">
            {second && <TrendingCard item={second} rank={2} />}
            {third && <TrendingCard item={third} rank={3} />}
          </div>
        </div>
      )}
    </section>
  )
}
