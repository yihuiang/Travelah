import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ItineraryMap from './ItineraryMap.jsx'
import ItineraryAddMenu from './ItineraryAddMenu.jsx'
import EditTripModal from './EditTripModal.jsx'
import InviteModal from './InviteModal.jsx'
import PackingList from '../trips/PackingList.jsx'
import TripBudget from '../trips/TripBudget.jsx'
import { useAuth, getAuthToken } from '../../context/AuthContext.jsx'
import { addPlaceToDay, addStopToDay, addTransportToDay, findStopInDay, formatDisplayTime, formatVisitDuration, removeStopFromDay, updateStopInDay } from '../../utils/itineraryActivity.js'
import ActivityStopDetail from './ActivityStopDetail.jsx'
import { reorderDayStops, splitDayActivities } from '../../utils/reorderItineraryDay.js'
import { updateTripItinerary } from '../../utils/tripsApi.js'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { shouldTranslatePlaceName } from '../../utils/localizeContent.js'
import { resolveAvatarUrl } from '../../utils/avatar.js'

function ActivityTag({ tag }) {
  const cls = tag.type === 'source' ? 'tag-source' : tag.type === 'tip' ? 'tag-tip' : 'tag-cat'
  return <span className={`activity-tag ${cls}`}>{tag.label}</span>
}

function ActivityCard({
  activity,
  saved,
  saving,
  onToggleSave,
  isActivePin,
  onSelect,
  onDragStart,
  onDragEnd,
  expanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onMoveToDay,
  days,
  activeDayIndex,
}) {
  const { tPlaceName } = useLanguage()
  const isTransport = activity.type === 'flight' || activity.type === 'train'
  const displayName = isTransport ? activity.name : tPlaceName(activity.name)
  const timeLabel = isTransport
    ? activity.time || formatDisplayTime(activity.scheduleTime || activity.arrivalTime)
    : activity.startTime
      ? formatDisplayTime(activity.startTime)
      : ''
  const durationLabel = !isTransport ? formatVisitDuration(activity.visitDuration || 60) : ''

  const nameEl = activity.googleMapsUri ? (
    <a
      href={activity.googleMapsUri}
      target="_blank"
      rel="noopener noreferrer"
      className="activity-name"
      onClick={(e) => e.stopPropagation()}
    >
      {displayName}
    </a>
  ) : activity.placeId ? (
    <Link to={`/explore/place/${activity.placeId}`} className="activity-name" onClick={(e) => e.stopPropagation()}>
      {displayName}
    </Link>
  ) : (
    <p className="activity-name">{displayName}</p>
  )

  return (
    <div className={`activity-stop${expanded ? ' activity-stop--expanded' : ''}`}>
      <div
        className={`activity-card${isActivePin ? ' active-pin' : ''}${isTransport ? ` activity-card--${activity.type}` : ''}`}
        onClick={() => onSelect(activity.pin)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect(activity.pin)
        }}
      >
      {onDragStart && (
        <button
          type="button"
          className="activity-drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <span className="material-symbols-outlined">drag_indicator</span>
        </button>
      )}
      <div className="activity-time-col">
        <div className={`activity-pin-num${isTransport ? ` activity-pin-num--${activity.type}` : ''}`}>
          {isTransport ? (
            <span className="material-symbols-outlined activity-transport-icon">{activity.icon}</span>
          ) : (
            activity.pin
          )}
        </div>
      </div>
      <div className="activity-divider" />
      <div className="activity-body">
        {nameEl}
        {(timeLabel || durationLabel) && (
          <div className="activity-meta-row">
            {timeLabel && (
              <span className="activity-meta-chip">
                <span className="material-symbols-outlined">schedule</span>
                {timeLabel}
              </span>
            )}
            {durationLabel && (
              <span className="activity-meta-chip">
                <span className="material-symbols-outlined">timelapse</span>
                {durationLabel}
              </span>
            )}
          </div>
        )}
        {activity.userNotes ? (
          <p className="activity-note activity-note--user">{activity.userNotes}</p>
        ) : activity.note ? (
          <p className="activity-note">{activity.note}</p>
        ) : null}
        {activity.tags?.length > 0 && (
          <div className="activity-tags">
            {activity.tags.map((tag) => (
              <ActivityTag key={tag.label} tag={tag} />
            ))}
          </div>
        )}
      </div>
      <div className="activity-card-right">
        {activity.likes && !isTransport && (
          <div className="activity-likes">
            <span className="material-symbols-outlined">favorite</span> {activity.likes}
          </div>
        )}
        <button
          type="button"
          className={`activity-expand${expanded ? ' expanded' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide stop details' : 'Show stop details'}
          title={expanded ? 'Hide details' : 'Edit time, notes & hours'}
        >
          <span className="material-symbols-outlined">{expanded ? 'expand_less' : 'more_horiz'}</span>
        </button>
        {!isTransport && activity.placeId && (
        <button
          type="button"
          className={`activity-save${saved ? ' saved' : ''}`}
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSave(activity)
          }}
          aria-label={saved ? 'Remove from saved places' : 'Save to my places'}
          title={saved ? 'Saved to your profile' : 'Save to your profile'}
        >
          <span className="material-symbols-outlined">{saved ? 'bookmark' : 'bookmark_border'}</span>
        </button>
        )}
      </div>
      </div>

      {expanded && (
        <ActivityStopDetail
          activity={activity}
          stopId={activity.id}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onMoveToDay={onMoveToDay}
          days={days}
          activeDayIndex={activeDayIndex}
        />
      )}
    </div>
  )
}

export default function ItineraryView({
  itinerary,
  variant = 'full',
  tripId = null,
  planMeta = null,
  onSaveTrip,
  onItineraryChange,
  onTripUpdated,
  onGenerateItinerary,
  saving = false,
  saveError = '',
  showFooter = true,
}) {
  const { token, user, isAuthenticated, toggleSavedPlace } = useAuth()
  const { t, tPlaceName, queueDynamicTranslations, language } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [localItinerary, setLocalItinerary] = useState(itinerary)
  const [activeDay, setActiveDay] = useState(0)
  const [activePin, setActivePin] = useState(1)
  const [draggingStopIndex, setDraggingStopIndex] = useState(null)
  const [dragOverStopIndex, setDragOverStopIndex] = useState(null)
  const [showOverview, setShowOverview] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [tripMembers, setTripMembers] = useState([])
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [editTripOpen, setEditTripOpen] = useState(false)
  const [expandedStopId, setExpandedStopId] = useState(null)
  const persistTimerRef = useRef(null)
  const itinBodyRef = useRef(null)
  const dayPanelRef = useRef(null)

  const scrollToItinerary = useCallback(({ focusDayPanel = false } = {}) => {
    const root = document.querySelector('.itin-v2')
    const styles = root ? getComputedStyle(root) : getComputedStyle(document.documentElement)
    const navHeight = Number.parseInt(styles.getPropertyValue('--itin-nav-h'), 10) || 62
    const dayBarHeight = focusDayPanel
      ? Number.parseInt(styles.getPropertyValue('--itin-day-bar-h'), 10) || 56
      : 0
    const target = focusDayPanel ? dayPanelRef.current : itinBodyRef.current
    if (!target) return

    const top = target.getBoundingClientRect().top + window.scrollY - navHeight - dayBarHeight
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (itinerary?.days?.length) {
      setLocalItinerary(itinerary)
    }
  }, [itinerary])

  useEffect(() => {
    const texts = new Set()
    for (const day of localItinerary?.days || []) {
      const { stops } = splitDayActivities(day.activities || [])
      for (const stop of stops) {
        if (stop.name && shouldTranslatePlaceName(stop.name, language)) {
          texts.add(stop.name)
        }
      }
    }
    if (texts.size) queueDynamicTranslations(Array.from(texts))
  }, [localItinerary, language, queueDynamicTranslations])

  useEffect(() => {
    if (!tripId || !isAuthenticated) return
    const authToken = token || getAuthToken()
    if (!authToken) return
    fetch(`/api/trips/${tripId}/members`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data.members)) setTripMembers(data.members) })
      .catch(() => {})
  }, [tripId, isAuthenticated, token])

  const isTripOwner = useMemo(() => {
    if (!tripId || !user?.id) return !tripId
    if (!tripMembers.length) return false
    const owner = tripMembers.find((m) => m.role === 'owner') || tripMembers[0]
    return owner?.userId === user.id
  }, [tripMembers, user?.id, tripId])

  useEffect(
    () => () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    },
    [],
  )

  const schedulePersist = useCallback(
    (next) => {
      if (!tripId) return
      const authToken = token || getAuthToken()
      if (!authToken) return

      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      persistTimerRef.current = setTimeout(() => {
        updateTripItinerary(tripId, next, authToken).catch(() => {})
      }, 600)
    },
    [tripId, token],
  )

  const applyItineraryUpdate = useCallback(
    (updater) => {
      setLocalItinerary((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        onItineraryChange?.(next)
        schedulePersist(next)
        return next
      })
    },
    [onItineraryChange, schedulePersist],
  )

  const [travelLegs, setTravelLegs] = useState({})

  const dayForLegs = localItinerary?.days?.[activeDay]
  const legsKey = dayForLegs
    ? splitDayActivities(dayForLegs.activities || [])
        .stops.map((s) => `${s.id}:${s.pin}`)
        .join('|')
    : ''

  useEffect(() => {
    const targetDay = localItinerary?.days?.[activeDay]
    if (!targetDay) {
      setTravelLegs({})
      return undefined
    }

    const { stops } = splitDayActivities(targetDay.activities || [])
    if (stops.length < 2) {
      setTravelLegs({})
      return undefined
    }

    let cancelled = false
    const payload = stops.map((stop) => ({
      pin: stop.pin,
      name: stop.name,
      type: stop.type || null,
      placeId: stop.placeId || null,
      googlePlaceId: stop.googlePlaceId || null,
      location: stop.location || null,
      state: stop.state || targetDay.destination || null,
      lat: stop.lat ?? null,
      lng: stop.lng ?? null,
      formattedAddress: stop.note || null,
      destination: targetDay.destination || null,
    }))

    fetch('/api/map/resolve-stops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: payload, withLegs: true }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const map = {}
        ;(data.legs || []).forEach((leg) => {
          if (leg.text) map[leg.toPin] = leg.text
        })
        setTravelLegs(map)
      })
      .catch(() => {
        if (!cancelled) setTravelLegs({})
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay, dayForLegs?.id, legsKey])

  if (!localItinerary?.days?.length) {
    return (
      <div className="itin-empty-state">
        <span className="material-symbols-outlined">map</span>
        <p>{t('No itinerary days to show yet.')}</p>
      </div>
    )
  }

  const day = localItinerary.days[activeDay]
  if (!day) {
    return (
      <div className="itin-empty-state">
        <span className="material-symbols-outlined">event_busy</span>
        <p>{t('This day could not be loaded.')}</p>
      </div>
    )
  }

  const { leading, stops } = splitDayActivities(day.activities)
  const canReorder = stops.length > 1

  const goToDay = (index) => {
    if (index < 0 || index >= localItinerary.days.length) return
    const fromOverview = showOverview
    setShowOverview(false)
    setActiveDay(index)
    setActivePin(1)
    setExpandedStopId(null)
    setDraggingStopIndex(null)
    setDragOverStopIndex(null)
    if (fromOverview) {
      requestAnimationFrame(() => scrollToItinerary({ focusDayPanel: true }))
    }
  }

  const savedPlaceIds = new Set((user?.savedPlaces || []).map((item) => item.placeId))
  const [savingPlaceId, setSavingPlaceId] = useState(null)

  const toggleSave = async (stop) => {
    const placeId = stop?.placeId
    if (!placeId) return

    if (!isAuthenticated) {
      navigate('/login', { state: { from: location, background: location } })
      return
    }

    const shouldSave = !savedPlaceIds.has(placeId)
    setSavingPlaceId(placeId)
    try {
      await toggleSavedPlace(placeId, shouldSave)
    } catch {
      // keep previous state on failure
    } finally {
      setSavingPlaceId(null)
    }
  }

  const handleDragStart = (event, stopIndex) => {
    setDraggingStopIndex(stopIndex)
    setDragOverStopIndex(stopIndex)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(stopIndex))
  }

  const handleDragOver = (event, stopIndex) => {
    event.preventDefault()
    if (draggingStopIndex === null || draggingStopIndex === stopIndex) return
    setDragOverStopIndex(stopIndex)
  }

  const handleDrop = (event, stopIndex) => {
    event.preventDefault()
    if (draggingStopIndex === null || draggingStopIndex === stopIndex) {
      setDraggingStopIndex(null)
      setDragOverStopIndex(null)
      return
    }

    const fromIndex = draggingStopIndex
    const draggedStop = stops[fromIndex]

    applyItineraryUpdate((prev) => {
      const days = [...prev.days]
      const reorderedDay = reorderDayStops(days[activeDay], fromIndex, stopIndex)
      days[activeDay] = reorderedDay

      if (activePin === draggedStop.pin) {
        const { stops: reordered } = splitDayActivities(reorderedDay.activities)
        const updated = reordered.find((stop) => stop.id === draggedStop.id)
        if (updated) setActivePin(updated.pin)
      }

      return { ...prev, days }
    })

    setDraggingStopIndex(null)
    setDragOverStopIndex(null)
  }

  const handleDragEnd = () => {
    setDraggingStopIndex(null)
    setDragOverStopIndex(null)
  }

  const handleUpdateStop = useCallback(
    (stopId, patch) => {
      applyItineraryUpdate((prev) => {
        const days = [...prev.days]
        days[activeDay] = updateStopInDay(days[activeDay], stopId, patch)
        return { ...prev, days }
      })
    },
    [activeDay, applyItineraryUpdate],
  )

  const handleRemoveStop = useCallback(
    (stopId) => {
      applyItineraryUpdate((prev) => {
        const days = [...prev.days]
        days[activeDay] = removeStopFromDay(days[activeDay], stopId)
        return { ...prev, days }
      })
      setExpandedStopId((current) => (current === stopId ? null : current))
      setActivePin(1)
    },
    [activeDay, applyItineraryUpdate],
  )

  const handleMoveStopToDay = useCallback(
    (stopId, targetDayIndex) => {
      if (targetDayIndex === activeDay) return
      applyItineraryUpdate((prev) => {
        if (targetDayIndex < 0 || targetDayIndex >= prev.days.length) return prev
        const sourceDay = prev.days[activeDay]
        const stop = findStopInDay(sourceDay, stopId)
        if (!stop) return prev

        const days = [...prev.days]
        days[activeDay] = removeStopFromDay(days[activeDay], stopId)
        days[targetDayIndex] = addStopToDay(days[targetDayIndex], { ...stop })
        return { ...prev, days }
      })
      setExpandedStopId(null)
      goToDay(targetDayIndex)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeDay, applyItineraryUpdate],
  )

  const handleAddPlace = (place, dayIndex = activeDay) => {
    const targetDay = typeof dayIndex === 'number' ? dayIndex : activeDay
    const target = localItinerary.days[targetDay]
    if (!target) return

    const { stops } = splitDayActivities(target.activities)
    const nextPin = stops.length + 1

    applyItineraryUpdate((prev) => {
      const days = [...prev.days]
      days[targetDay] = addPlaceToDay(days[targetDay], place, days[targetDay].num)
      return { ...prev, days }
    })

    if (targetDay !== activeDay) {
      goToDay(targetDay)
    }
    setActivePin(nextPin)
  }

  const handleAddTransport = (type, details, dayIndex = activeDay) => {
    const targetDay = typeof dayIndex === 'number' ? dayIndex : activeDay
    const target = localItinerary.days[targetDay]
    if (!target) return

    const { stops } = splitDayActivities(target.activities)
    const isArrival = details.legType !== 'departure'
    const nextPin = isArrival ? 1 : stops.length + 1

    applyItineraryUpdate((prev) => {
      const days = [...prev.days]
      days[targetDay] = addTransportToDay(days[targetDay], type, details, days[targetDay].num)
      return { ...prev, days }
    })

    if (targetDay !== activeDay) {
      goToDay(targetDay)
    }
    setActivePin(nextPin)
  }

  const isPreview = variant === 'preview'

  return (
    <>
      <div className="itin-hero">
        <div className="itin-hero-inner">
          <div className="itin-hero-left">
            {tripId && (
              <Link to="/trips" className="itin-back-link">
                <span className="material-symbols-outlined">arrow_back</span>
                {t('Back to My Trips')}
              </Link>
            )}
            <div className="itin-eyebrow">
              <div className="itin-eyebrow-dot" />
              <span className="itin-eyebrow-text">{t('Your itinerary')}</span>
            </div>
            <h1 className="itin-headline">
              {localItinerary.dayCount} {t('Days across')}
              <br />
              <em>{localItinerary.destination}.</em>
            </h1>
            <div className="itin-meta-row">
              <span className="itin-badge">
                <span className="material-symbols-outlined">calendar_month</span> {localItinerary.dateRange}
              </span>
              <span className="itin-badge">
                <span className="material-symbols-outlined">nights_stay</span> {localItinerary.nights} {t('nights')}
              </span>
              <span className="itin-badge highlight">
                <span className="material-symbols-outlined">museum</span> {localItinerary.vibe}
              </span>
              <span className="itin-badge">
                <span className="material-symbols-outlined">coffee</span> {localItinerary.pace}
              </span>
              <span className="itin-badge">
                <span className="material-symbols-outlined">account_balance_wallet</span> {localItinerary.budget}
              </span>
            </div>
          </div>
          <div className={`itin-hero-right${isPreview ? ' itin-hero-right--preview' : ''}`}>
            {isPreview ? (
              <>
                {saveError && <p className="itin-preview-save-error">{saveError}</p>}
                <button
                  type="button"
                  className="itin-action primary"
                  onClick={onSaveTrip}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <span className="material-symbols-outlined spin">hourglass_empty</span>
                      {t('Saving…')}
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">bookmark</span>
                      {t('Save to My Trips')}
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                {/* Unsaved itinerary (e.g. from the AI concierge) — offer to save */}
                {!tripId && onSaveTrip && (
                  <>
                    {saveError && <p className="itin-preview-save-error">{saveError}</p>}
                    <button
                      type="button"
                      className="itin-action primary"
                      onClick={onSaveTrip}
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <span className="material-symbols-outlined spin">hourglass_empty</span>
                          {t('Saving…')}
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">bookmark</span>
                          {t('Save to My Trips')}
                        </>
                      )}
                    </button>
                  </>
                )}
                {/* Avatar stack + invite button — always show when tripId exists */}
                {tripId && (
                  <button
                    type="button"
                    className="itin-member-stack"
                    onClick={() => setInviteOpen(true)}
                    title={t('Invite friends')}
                  >
                    {tripMembers.slice(0, 4).map((m, i) => {
                      const avatarSrc = resolveAvatarUrl(m.avatarUrl)
                      return (
                      <span
                        key={m.userId}
                        className="itin-member-avatar"
                        style={{ zIndex: 10 - i }}
                        title={m.displayName}
                      >
                        {avatarSrc
                          ? <img src={avatarSrc} alt={m.displayName} />
                          : <span className="itin-member-initials">{(m.displayName || '?').slice(0, 2).toUpperCase()}</span>
                        }
                      </span>
                      )
                    })}
                    {tripMembers.length > 4 && (
                      <span className="itin-member-avatar itin-member-more" style={{ zIndex: 6 }}>
                        +{tripMembers.length - 4}
                      </span>
                    )}
                    {/* Add-person icon always at the end */}
                    <span className="itin-member-avatar itin-member-add" style={{ zIndex: 1 }} title={t('Invite friends')}>
                      <span className="material-symbols-outlined">person_add</span>
                    </span>
                  </button>
                )}
                {tripId && planMeta && onGenerateItinerary && (
                  <button type="button" className="itin-action" onClick={() => setEditTripOpen(true)}>
                    <span className="material-symbols-outlined">edit</span> {t('Edit trip')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className={`day-selector-wrap${addMenuOpen ? ' add-menu-open' : ''}`}>
        <div className="day-selector-inner">
          <div className="day-selector" role="tablist" aria-label="Trip days">
            <button
              type="button"
              role="tab"
              aria-selected={showOverview}
              className={`day-tab day-tab--overview${showOverview ? ' active' : ''}`}
              onClick={() => {
                setShowOverview(true)
                requestAnimationFrame(() => scrollToItinerary())
              }}
            >
              <span className="day-tab-num">
                <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle' }}>calendar_view_week</span>
              </span>
              <span className="day-tab-label">{t('Overview')}</span>
            </button>
            {localItinerary.days.map((d, index) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={!showOverview && activeDay === index}
                className={`day-tab${!showOverview && activeDay === index ? ' active' : ''}`}
                onClick={() => goToDay(index)}
              >
                <span className="day-tab-num">{t('Day')} {d.num}</span>
                <span className="day-tab-label">{d.tabLabel}</span>
              </button>
            ))}
          </div>
          <ItineraryAddMenu
            open={addMenuOpen}
            onOpen={() => setAddMenuOpen(true)}
            onClose={() => setAddMenuOpen(false)}
            days={localItinerary.days}
            activeDayIndex={activeDay}
            onAddPlace={handleAddPlace}
            onAddTransport={handleAddTransport}
          />
        </div>
      </div>

      <div className={`itin-body${addMenuOpen ? ' add-menu-open' : ''}`} ref={itinBodyRef}>
        {addMenuOpen && (
          <div className="itin-add-backdrop open" onClick={() => setAddMenuOpen(false)} aria-hidden="false" />
        )}

        <div className="itin-main">

        {showOverview && (
          <div className="itin-overview">
            <div className="itin-overview-header">
              <span className="material-symbols-outlined">calendar_view_week</span>
              <h2>{t('Overview')} <span className="itin-overview-count">· {localItinerary.days.length} {t('days')}</span></h2>
            </div>
            <div className="itin-overview-list">
              {localItinerary.days.map((d, index) => {
                const { stops: dayStops } = splitDayActivities(d.activities || [])
                return (
                  <button
                    key={d.id}
                    type="button"
                    className="overview-day-row"
                    onClick={() => goToDay(index)}
                  >
                    <div className="overview-day-head">
                      <span className="overview-day-num">{t('Day')} {d.num}</span>
                      {d.date && <span className="overview-day-date">{d.date}</span>}
                      <span className="overview-day-title">{d.title}</span>
                      <span className="material-symbols-outlined overview-day-chevron">chevron_right</span>
                    </div>
                    {dayStops.length > 0 && (
                      <div className="overview-stops-row">
                        {dayStops.map((stop, si) => (
                          <Fragment key={stop.id || si}>
                            {si > 0 && <span className="overview-stop-arrow">›</span>}
                            <span className="overview-stop-chip">
                              <span className="material-symbols-outlined overview-stop-icon">
                                {stop.icon || 'location_on'}
                              </span>
                              <span className="overview-stop-name">{tPlaceName(stop.name)}</span>
                            </span>
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {tripId && (
              <div className="itin-overview-packing">
                <div className="itin-overview-header">
                  <span className="material-symbols-outlined">backpack</span>
                  <h2>{t('Packing List')}</h2>
                </div>
                <PackingList
                  key={tripId}
                  tripId={tripId}
                  initialItems={planMeta?.packingList || []}
                />
              </div>
            )}

            {tripId && (
              <div className="itin-overview-packing">
                <div className="itin-overview-header">
                  <span className="material-symbols-outlined">account_balance_wallet</span>
                  <h2>{t('Trip Budget')}</h2>
                </div>
                <TripBudget
                  key={tripId}
                  tripId={tripId}
                  initialItems={planMeta?.budgetItems || []}
                  initialDisplayCurrency={planMeta?.budgetCurrency || null}
                />
              </div>
            )}
          </div>
        )}

        {!showOverview && <div className="day-panel" ref={dayPanelRef}>
          <div className="day-panel-header">
            <div>
              <p className="day-section-eyebrow">{t('Day')} {day.num}</p>
              <h2 className="day-panel-title">{day.title}</h2>
              {canReorder && <p className="day-reorder-hint">{t('Drag stops to reorder your day')}</p>}
            </div>
            {day.date && <span className="day-panel-date">{day.date}</span>}
          </div>

          <div className="activities">
            {leading.map((item, i) => (
              <div key={`${day.id}-lead-${i}`} className="travel-connector">
                <span className="material-symbols-outlined">arrow_downward</span>
                <span className="travel-connector-text">{item.connector}</span>
              </div>
            ))}

            {stops.map((stop, stopIndex) => (
              <Fragment key={stop.id}>
                {stopIndex > 0 && (
                  <div className="travel-connector">
                    <span className="material-symbols-outlined">directions_car</span>
                    <span className="travel-connector-text">
                      {travelLegs[stop.pin] || t('Calculating travel time…')}
                    </span>
                  </div>
                )}
                <div
                  className={`activity-card-wrap${
                    draggingStopIndex === stopIndex ? ' dragging' : ''
                  }${dragOverStopIndex === stopIndex ? ' drag-over' : ''}`}
                  onDragOver={canReorder ? (event) => handleDragOver(event, stopIndex) : undefined}
                  onDrop={canReorder ? (event) => handleDrop(event, stopIndex) : undefined}
                >
                  <ActivityCard
                    activity={stop}
                    saved={stop.placeId ? savedPlaceIds.has(stop.placeId) : false}
                    saving={savingPlaceId === stop.placeId}
                    onToggleSave={toggleSave}
                    isActivePin={activePin === stop.pin}
                    onSelect={setActivePin}
                    expanded={expandedStopId === stop.id}
                    onToggleExpand={() =>
                      setExpandedStopId((current) => (current === stop.id ? null : stop.id))
                    }
                    onUpdate={handleUpdateStop}
                    onRemove={handleRemoveStop}
                    onMoveToDay={handleMoveStopToDay}
                    days={localItinerary.days}
                    activeDayIndex={activeDay}
                    onDragStart={
                      canReorder ? (event) => handleDragStart(event, stopIndex) : undefined
                    }
                    onDragEnd={canReorder ? handleDragEnd : undefined}
                  />
                </div>
              </Fragment>
            ))}
          </div>

          <div className="day-panel-nav">
            <button
              type="button"
              className="day-nav-btn"
              onClick={() => goToDay(activeDay - 1)}
              disabled={activeDay === 0}
            >
              <span className="material-symbols-outlined">arrow_back</span> {t('Day')} {day.num - 1}
            </button>
            <button
              type="button"
              className="day-nav-btn next"
              onClick={() => goToDay(activeDay + 1)}
              disabled={activeDay === localItinerary.days.length - 1}
            >
              {t('Day')} {day.num + 1} <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>}

        {!showOverview && (
        <div className="map-panel">
          <ItineraryMap day={day} activePin={activePin} onPinClick={setActivePin} />
        </div>
        )}
        </div>
      </div>

      {showFooter && (
        <footer className="itin-footer">
          <div className="itin-footer-inner">
            <Link to="/" className="itin-footer-logo">
              travelah
            </Link>
            <ul className="itin-footer-nav">
              <li>
                <Link to="/explore">{t('Destinations')}</Link>
              </li>
              <li>
                <a href="#heritage">{t('Heritage')}</a>
              </li>
              <li>
                <a href="#about">{t('About')}</a>
              </li>
              <li>
                <a href="#contact">{t('Contact')}</a>
              </li>
            </ul>
            <span className="itin-footer-copy">© {new Date().getFullYear()} travelah</span>
          </div>
        </footer>
      )}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        tripId={tripId}
        tripTitle={localItinerary?.destination || localItinerary?.title || ''}
        initialMembers={tripMembers}
        onMembersChange={setTripMembers}
      />

      {tripId && planMeta && onGenerateItinerary && (
        <EditTripModal
          open={editTripOpen}
          onClose={() => setEditTripOpen(false)}
          tripId={tripId}
          planMeta={planMeta}
          itinerary={localItinerary}
          onGenerateItinerary={onGenerateItinerary}
          canDeleteTrip={isTripOwner}
          onSaved={({ trip, itinerary: nextItinerary, planMeta: nextPlanMeta }) => {
            setLocalItinerary(nextItinerary)
            onItineraryChange?.(nextItinerary)
            onTripUpdated?.({ trip, itinerary: nextItinerary, planMeta: nextPlanMeta })
          }}
          onDeleted={() => {
            setEditTripOpen(false)
            navigate('/trips')
          }}
        />
      )}
    </>
  )
}
