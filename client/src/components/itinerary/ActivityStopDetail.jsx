import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import {
  formatDisplayTime,
  formatVisitDuration,
  visitDurationPresets,
} from '../../utils/itineraryActivity.js'

async function fetchOpeningHours(activity) {
  if (activity.placeId) {
    const res = await fetch(`/api/places/${encodeURIComponent(activity.placeId)}`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.openingHours) ? data.openingHours : []
  }
  if (activity.googlePlaceId) {
    const res = await fetch(`/api/google/places/${encodeURIComponent(activity.googlePlaceId)}/details`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.openingHours) ? data.openingHours : []
  }
  return []
}

function MoveToDayPicker({ days, onSelect }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function onDocClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={`activity-detail-move-picker${open ? ' open' : ''}`} ref={ref}>
      <span className="material-symbols-outlined" aria-hidden="true">
        event_repeat
      </span>
      <button
        type="button"
        className="activity-detail-move-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{t('Move to day…')}</span>
        <span className="material-symbols-outlined activity-detail-move-caret">expand_more</span>
      </button>
      {open ? (
        <ul className="activity-detail-move-menu" role="listbox" aria-label={t('Move to day…')}>
          {days.map((day) => (
            <li key={day.index}>
              <button
                type="button"
                role="option"
                className="activity-detail-move-option"
                onClick={() => {
                  onSelect(day.index)
                  setOpen(false)
                }}
              >
                <span className="activity-detail-move-option-label">
                  {t('Day')} {day.num}
                  {day.label ? ` · ${day.label}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default function ActivityStopDetail({ activity, stopId, onUpdate, onRemove, onMoveToDay, days = [], activeDayIndex = 0 }) {
  const [hoursLoading, setHoursLoading] = useState(false)
  const [hoursError, setHoursError] = useState(false)
  const isTransport = activity.type === 'flight' || activity.type === 'train'
  const openingHours = activity.openingHours || []
  const presets = visitDurationPresets()

  useEffect(() => {
    if (isTransport || openingHours.length > 0) return
    if (!activity.placeId && !activity.googlePlaceId) return

    let cancelled = false
    setHoursLoading(true)
    setHoursError(false)

    fetchOpeningHours(activity)
      .then((hours) => {
        if (cancelled) return
        if (hours.length > 0) {
          onUpdate(stopId, { openingHours: hours })
        }
      })
      .catch(() => {
        if (!cancelled) setHoursError(true)
      })
      .finally(() => {
        if (!cancelled) setHoursLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    activity.placeId,
    activity.googlePlaceId,
    isTransport,
    onUpdate,
    openingHours.length,
    stopId,
  ])

  const otherDays = days
    .map((d, index) => ({ index, num: d.num, label: d.tabLabel }))
    .filter((d) => d.index !== activeDayIndex)

  const actionsBlock = (
    <div className="activity-detail-actions">
      {onMoveToDay && otherDays.length > 0 && (
        <MoveToDayPicker
          days={otherDays}
          onSelect={(targetDayIndex) => onMoveToDay(stopId, targetDayIndex)}
        />
      )}
      {onRemove && (
        <button
          type="button"
          className="activity-detail-delete"
          onClick={() => onRemove(stopId)}
        >
          <span className="material-symbols-outlined">delete</span>
          Remove stop
        </button>
      )}
    </div>
  )

  if (isTransport) {
    return (
      <div className="activity-stop-detail">
        <div className="activity-detail-row">
          <span className="activity-detail-label">
            <span className="material-symbols-outlined">schedule</span>
            Schedule
          </span>
          <span className="activity-detail-value">
            {activity.time || formatDisplayTime(activity.scheduleTime || activity.arrivalTime) || '—'}
          </span>
        </div>
        {activity.location && (
          <div className="activity-detail-row">
            <span className="activity-detail-label">
              <span className="material-symbols-outlined">location_on</span>
              Location
            </span>
            <span className="activity-detail-value">{activity.location}</span>
          </div>
        )}
        {actionsBlock}
      </div>
    )
  }

  return (
    <div className="activity-stop-detail" onClick={(e) => e.stopPropagation()}>
      <div className="activity-detail-grid">
        <label className="activity-detail-field">
          <span className="activity-detail-label">
            <span className="material-symbols-outlined">schedule</span>
            Start time
          </span>
          <input
            type="time"
            className="activity-detail-input"
            value={activity.startTime || ''}
            onChange={(e) => onUpdate(stopId, { startTime: e.target.value || null })}
          />
        </label>

        <label className="activity-detail-field">
          <span className="activity-detail-label">
            <span className="material-symbols-outlined">timelapse</span>
            Duration
          </span>
          <select
            className="activity-detail-input"
            value={activity.visitDuration || 60}
            onChange={(e) => onUpdate(stopId, { visitDuration: Number(e.target.value) })}
          >
            {presets.map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatVisitDuration(minutes)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="activity-detail-field activity-detail-field--full">
        <span className="activity-detail-label">
          <span className="material-symbols-outlined">edit_note</span>
          Notes
        </span>
        <textarea
          className="activity-detail-textarea"
          rows={2}
          placeholder="Add notes for this stop…"
          value={activity.userNotes || ''}
          onChange={(e) => onUpdate(stopId, { userNotes: e.target.value })}
        />
      </label>

      <div className="activity-detail-hours">
        <p className="activity-detail-label">
          <span className="material-symbols-outlined">store</span>
          Google opening hours
        </p>
        {hoursLoading ? (
          <p className="activity-detail-muted">Loading hours…</p>
        ) : openingHours.length > 0 ? (
          <ul className="activity-detail-hours-list">
            {openingHours.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : hoursError ? (
          <p className="activity-detail-muted">Could not load opening hours.</p>
        ) : (
          <p className="activity-detail-muted">
            Opening hours not available
            {activity.googleMapsUri ? (
              <>
                {' '}
                —{' '}
                <a href={activity.googleMapsUri} target="_blank" rel="noopener noreferrer">
                  check on Google Maps
                </a>
              </>
            ) : null}
            .
          </p>
        )}
      </div>

      {actionsBlock}
    </div>
  )
}
