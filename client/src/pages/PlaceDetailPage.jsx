import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import HomeFooter from '../components/home/HomeFooter.jsx'
import HomeTopNav from '../components/home/HomeTopNav.jsx'
import PlaceImage from '../components/PlaceImage.jsx'
import SavePlaceToast from '../components/SavePlaceToast.jsx'
import AddToItineraryButton from '../components/AddToItineraryButton.jsx'
import AddToItineraryConfirmModal from '../components/AddToItineraryConfirmModal.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useTimedToast } from '../hooks/useTimedToast.js'
import { useAddToItinerary } from '../hooks/useAddToItinerary.js'
import { getPlaceImageUrl, getPostImageUrl } from '../utils/resolveImage.js'
import { getMapEmbedUrl, getMapSearchUrl } from '../utils/placeMap.js'
import { formatPlaceLikes, shouldTranslateDescription, shouldTranslatePlaceName } from '../utils/localizeContent.js'
import '../styles/home-v2.css'
import '../styles/place-detail-v2.css'

const PLATFORM_LABELS = {
  xhs: 'RedNote',
  ig: 'Instagram',
  dy: 'Douyin',
  tiktok: 'TikTok',
  instagram: 'Instagram',
}

function formatCategoryLabel(category) {
  if (!category) return 'Culture'
  return category
    .split(/[\s_]+/)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

function formatPostLikes(post) {
  const label = (post.likesLabel || post.likes || '').replace(/^🔥\s*/, '').trim()
  if (label) return label.replace(/\s*likes?$/i, '')
  return '—'
}

function platformLabel(post) {
  return post.platformName || PLATFORM_LABELS[post.platform] || 'RedNote'
}

function buildGalleryImages(coverImage, posts, placeName) {
  const seen = new Set()
  const items = []

  function addFromPost(post) {
    const src = getPostImageUrl(post)
    if (!src || seen.has(src)) return
    seen.add(src)
    items.push({ src, title: post.title, subtitle: post.location })
  }

  const cover = getPlaceImageUrl(coverImage)
  if (cover && !seen.has(cover)) {
    seen.add(cover)
    items.push({ src: cover, title: placeName, subtitle: null })
  }
  for (const post of posts) {
    addFromPost(post)
  }
  return items
}

const POSTS_PER_PAGE = 3

function backLabel(from) {
  if (!from || from === '/') return 'Back to Home'
  if (from.startsWith('/explore')) return 'Back to Explore'
  if (from.startsWith('/profile')) return 'Back to Profile'
  if (from.startsWith('/plan')) return 'Back to Plan'
  if (from.startsWith('/trips')) return 'Back to Trips'
  return 'Back'
}

function GoogleStars({ rating }) {
  const rounded = Math.round(rating)
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="material-symbols-outlined"
          style={{ fontVariationSettings: n <= rounded ? "'FILL' 1" : "'FILL' 0" }}
        >
          star
        </span>
      ))}
    </span>
  )
}

function SocialPost({ post }) {
  const { tContent } = useLanguage()
  const rawText = post.description || post.title || ''
  const postText = rawText ? tContent(rawText) : ''
  const thumb = getPostImageUrl(post)
  const content = (
    <>
      {thumb ? (
        <img className="post-thumb" src={thumb} alt="" loading="lazy" />
      ) : (
        <div className="post-thumb">
          <span className="material-symbols-outlined" style={{ color: 'var(--sand)' }}>
            photo_camera
          </span>
        </div>
      )}
      <div className="post-body">
        <div className="post-meta">
          <span className="post-source">{platformLabel(post)}</span>
        </div>
        <p className="post-text">{postText}</p>
        <div className="post-stats">
          <span className="post-stat">
            <span className="material-symbols-outlined">favorite</span>
            {formatPostLikes(post)}
          </span>
          {post.comments && (
            <span className="post-stat">
              <span className="material-symbols-outlined">chat_bubble</span>
              {post.comments}
            </span>
          )}
        </div>
      </div>
    </>
  )

  if (post.noteUrl) {
    return (
      <a href={post.noteUrl} target="_blank" rel="noreferrer" className="social-post">
        {content}
      </a>
    )
  }

  return <div className="social-post">{content}</div>
}

export default function PlaceDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { language, t, tPlaceName, tContent, queueDynamicTranslations, tState } = useLanguage()
  const { isAuthenticated, token, user, toggleSavedPlace } = useAuth()
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
  const [place, setPlace] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [postPage, setPostPage] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/places/${id}/posts?lang=${encodeURIComponent(language)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Place not found')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setPlace(data.place)
          setPosts(data.posts || [])
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
  }, [id, language])

  useEffect(() => {
    setPostPage(0)
  }, [id])

  useEffect(() => {
    if (!isAuthenticated || !token || !id) {
      setSaved(false)
      return
    }

    const savedFromSession = (user?.savedPlaces || []).some((item) => item.placeId === id)
    if (savedFromSession) {
      setSaved(true)
      return
    }

    let cancelled = false
    fetch(`/api/profile/me/saved-places/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setSaved(Boolean(data.saved))
      })
      .catch(() => {
        if (!cancelled) setSaved(false)
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, token, id, user?.savedPlaces])

  async function handleToggleSave() {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: `/explore/place/${id}` }, background: location } })
      return
    }

    setSaveLoading(true)
    const wasSaved = saved
    try {
      await toggleSavedPlace(id, !saved)
      setSaved((value) => !value)
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
      // keep previous saved state on failure
    } finally {
      setSaveLoading(false)
    }
  }

  const displayName = place ? tPlaceName(place.name) : ''

  const rawGoogleDesc = place?.googleDescription?.trim() || ''
  const defaultDesc =
    'A curated stop from the Travelah community — explore stories, flavours, and views linked below.'

  const placeDescription = tContent(rawGoogleDesc || defaultDesc)

  useEffect(() => {
    if (!place) return
    const texts = []
    if (shouldTranslatePlaceName(place.name, language)) texts.push(place.name)
    if (rawGoogleDesc && shouldTranslateDescription(rawGoogleDesc, language)) texts.push(rawGoogleDesc)
    if (texts.length) queueDynamicTranslations(texts)
  }, [place, language, queueDynamicTranslations, rawGoogleDesc])

  useEffect(() => {
    if (!posts.length) return
    const texts = []
    for (const post of posts) {
      const raw = (post.description || post.title || '').trim()
      if (raw && shouldTranslateDescription(raw, language)) texts.push(raw)
    }
    if (texts.length) queueDynamicTranslations(texts)
  }, [posts, language, queueDynamicTranslations])

  const gallery = useMemo(
    () => (place ? buildGalleryImages(place.coverImage, posts, displayName) : []),
    [place, posts, displayName],
  )

  const locationLabel =
    place?.state && place.state !== 'Malaysia'
      ? `${tState(place.state)}, ${tState('Malaysia')}`
      : tState('Malaysia')
  const mapEmbedUrl = place ? getMapEmbedUrl(place) : null
  const mapSearchUrl = place ? place.googleMapsUri || getMapSearchUrl(place) : null
  const extraGalleryCount = Math.max(0, gallery.length - 4)
  const postPageCount = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE))
  const visiblePosts = posts.slice(
    postPage * POSTS_PER_PAGE,
    postPage * POSTS_PER_PAGE + POSTS_PER_PAGE,
  )
  const showPostsSection = posts.length > 0 || (place?.linkedPostCount ?? place?.postCount ?? 0) > 0
  const returnTo = location.state?.from

  function handleBack() {
    if (returnTo === '/explore') {
      navigate('/explore')
      return
    }
    if (returnTo) {
      navigate(returnTo)
      return
    }
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/explore')
  }

  return (
    <div className="home-v2 place-detail-v2">
      <HomeTopNav activePage="explore" />

      <div className="place-detail-page">
        <button type="button" className="back-link" onClick={handleBack}>
          <span className="material-symbols-outlined">arrow_back</span>
          {backLabel(returnTo)}
        </button>

        {loading ? (
          <p className="place-detail-status">Loading place…</p>
        ) : error ? (
          <p className="place-detail-status error">{error}</p>
        ) : place ? (
          <>
            <header className="detail-hero">
              <div className="hero-eyebrow">
                <div className="hero-eyebrow-dot" />
                <span className="hero-eyebrow-text">{locationLabel}</span>
              </div>
              <h1 className="hero-title">{displayName}</h1>
              <p className="hero-desc">{placeDescription}</p>
              <div className="hero-badges">
                <span className="hero-badge outline">
                  <span className="material-symbols-outlined">favorite</span>
                  {formatPlaceLikes(place)} likes
                </span>
                <span className="hero-badge outline">
                  <span className="material-symbols-outlined">article</span>
                  {place.postCount || posts.length} related posts
                </span>
                {(place.categories || []).map((cat) => (
                  <span key={cat} className="hero-badge cat">
                    {formatCategoryLabel(cat)}
                  </span>
                ))}
              </div>
            </header>

            {gallery.length > 0 && (
              <section className="gallery">
                {gallery.slice(0, 4).map((item, i) => (
                  <div key={item.src + i} className="gallery-tile">
                    <PlaceImage
                      src={item.src}
                      alt={displayName}
                      className="gallery-img-fallback"
                    />
                    {i === 3 && extraGalleryCount > 0 && (
                      <div className="gallery-more">
                        <span className="material-symbols-outlined">photo_library</span>+
                        {extraGalleryCount} more
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            <div className="place-detail-body">
              <div className="section-block">
                <h2 className="section-heading">Discover {displayName}</h2>

                <div className="discover-split">
                  <div className="info-card">
                    {place.googleRating != null && (
                      <div className="info-row">
                        <div className="info-icon">
                          <span className="material-symbols-outlined">star</span>
                        </div>
                        <div>
                          <p className="info-label">Google Rating</p>
                          <p className="info-value">
                            <GoogleStars rating={place.googleRating} />
                            {place.googleRating.toFixed(1)}
                            {place.googleReviewCount != null && (
                              <span style={{ fontWeight: 500, color: 'var(--muted)' }}>
                                {' '}
                                ({place.googleReviewCount.toLocaleString()} Google reviews)
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}

                    {place.openingHours?.length > 0 && (
                      <div className="info-row">
                        <div className="info-icon">
                          <span className="material-symbols-outlined">schedule</span>
                        </div>
                        <div>
                          <p className="info-label">Opening Hours</p>
                          <ul className="info-hours-list">
                            {place.openingHours.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>

                  <aside className="location-card">
                    <p className="info-label location-card-label">Location</p>
                    {mapEmbedUrl ? (
                      <div className="map-wrap">
                        <iframe
                          title={`Map — ${displayName}`}
                          src={mapEmbedUrl}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          allowFullScreen
                        />
                      </div>
                    ) : mapSearchUrl ? (
                      <a
                        href={mapSearchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="map-fallback-link"
                      >
                        <span className="material-symbols-outlined">map</span>
                        Open in Maps
                      </a>
                    ) : null}
                  </aside>
                </div>
              </div>

              {showPostsSection && (
                <div className="section-block">
                    <div className="section-heading-row">
                      <h2 className="section-heading">What people are posting</h2>
                      {posts.length > 0 && (
                        <span className="posts-count-label">
                          {postPage * POSTS_PER_PAGE + 1}–
                          {Math.min((postPage + 1) * POSTS_PER_PAGE, posts.length)} of {posts.length}
                        </span>
                      )}
                    </div>

                    {posts.length > 0 ? (
                      <>
                        <div className="social-feed">
                          {visiblePosts.map((post) => (
                            <SocialPost key={post.id} post={post} />
                          ))}
                        </div>

                        {postPageCount > 1 && (
                          <div className="feed-pagination">
                            <button
                              type="button"
                              className="feed-page-btn"
                              onClick={() => setPostPage((page) => Math.max(0, page - 1))}
                              disabled={postPage === 0}
                              aria-label="Previous posts"
                            >
                              <span className="material-symbols-outlined">chevron_left</span>
                              Previous
                            </button>
                            <span className="feed-page-indicator">
                              Page {postPage + 1} of {postPageCount}
                            </span>
                            <button
                              type="button"
                              className="feed-page-btn feed-page-btn--next"
                              onClick={() =>
                                setPostPage((page) => Math.min(postPageCount - 1, page + 1))
                              }
                              disabled={postPage >= postPageCount - 1}
                              aria-label="Next posts"
                            >
                              Next
                              <span className="material-symbols-outlined">chevron_right</span>
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="body-text posts-empty">
                        Related posts are still syncing — try refreshing in a moment.
                      </p>
                    )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {place && !loading && !error && (
        <div className="floating-bar">
          <button
            type="button"
            className={`btn-floating-save${saved ? ' saved' : ''}`}
            onClick={handleToggleSave}
            disabled={saveLoading}
            aria-label={saved ? 'Unsave place' : 'Save place'}
          >
            <span className="material-symbols-outlined">
              {saved ? 'bookmark' : 'bookmark_border'}
            </span>
          </button>
          <AddToItineraryButton
            className="btn-floating"
            loading={itineraryLoading}
            onAdd={() => addToItinerary(place)}
          />
        </div>
      )}

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
