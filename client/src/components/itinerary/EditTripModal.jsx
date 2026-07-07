import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  VIBE_OPTIONS,
  PACE_OPTIONS,
  BUDGET_OPTIONS,
  buildPlanLabels,
} from '../../constants/planOptions.js'
import { countTripDays, mergeGeneratedExtraDays, resizeItineraryDays } from '../../utils/tripItineraryEdit.js'
import {
  adjustSegmentDay,
  allocateDaysPerSegment,
  buildTripTitle,
  restructureItineraryBySegments,
  resolveInitialSegmentPlan,
  segmentDayRanges,
} from '../../utils/tripSegmentEdit.js'
import { updateTrip, deleteTrip } from '../../utils/tripsApi.js'
import { getAuthToken } from '../../context/AuthContext.jsx'
import '../../styles/edit-trip-modal-v2.css'

const FALLBACK_LOCATIONS = [
  { id: 'pulau-pinang', name: 'Penang' },
  { id: 'kuala-lumpur', name: 'Kuala Lumpur' },
  { id: 'kedah-langkawi', name: 'Langkawi' },
  { id: 'sarawak-kuching', name: 'Kuching' },
  { id: 'sabah', name: 'Sabah' },
  { id: 'pahang-cameron', name: 'Cameron Highlands' },
  { id: 'melaka', name: 'Melaka' },
  { id: 'johor', name: 'Johor' },
  { id: 'kedah', name: 'Kedah' },
  { id: 'terengganu', name: 'Terengganu' },
  { id: 'perak', name: 'Perak' },
]

const MS_PER_DAY = 86400000

function formatLocalDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function shiftDate(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  return formatLocalDate(date)
}

function dayOffsetBetween(fromStr, toStr) {
  const from = new Date(`${fromStr}T00:00:00`)
  const to = new Date(`${toStr}T00:00:00`)
  return Math.round((to - from) / MS_PER_DAY)
}

function formatDateSummary(startDate, endDate) {
  const days = countTripDays(startDate, endDate)
  if (!days) return null
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const nights = days - 1
  const text = `${start.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`
  return { text, nights, days }
}

export default function EditTripModal({
  open,
  onClose,
  tripId,
  planMeta,
  itinerary,
  onGenerateItinerary,
  onSaved,
  onDeleted,
  canDeleteTrip = true,
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const initialSegmentRef = useRef(null)

  const [startDate, setStartDate] = useState(planMeta.startDate || '')
  const [endDate, setEndDate] = useState(planMeta.endDate || '')
  const [destinations, setDestinations] = useState([])
  const [segmentDays, setSegmentDays] = useState([])
  const [vibeIds, setVibeIds] = useState(() => new Set(planMeta.vibes || []))
  const [pace, setPace] = useState(planMeta.pace || 'balanced')
  const [budget, setBudget] = useState(planMeta.budget || 'mid')
  const [locationOptions, setLocationOptions] = useState(FALLBACK_LOCATIONS)
  const [showAddState, setShowAddState] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [draggingStateIndex, setDraggingStateIndex] = useState(null)
  const [dragOverStateIndex, setDragOverStateIndex] = useState(null)

  useEffect(() => {
    if (!open) return
    const initial = resolveInitialSegmentPlan(planMeta, itinerary)
    initialSegmentRef.current = initial
    setStartDate(planMeta.startDate || '')
    setEndDate(planMeta.endDate || '')
    setDestinations(initial.destinations)
    setSegmentDays(initial.daysPerDestination)
    setVibeIds(new Set(planMeta.vibes || []))
    setPace(planMeta.pace || 'balanced')
    setBudget(planMeta.budget || 'mid')
    setError('')
    setConfirm(null)
    setShowAddState(false)
    setDeleting(false)
    setDraggingStateIndex(null)
    setDragOverStateIndex(null)
  }, [open, planMeta, itinerary])

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    fetch('/api/locations?recommended=true')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const chips = data.locations || []
        if (chips.length > 0) setLocationOptions(chips)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape' && !saving && !deleting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, saving, deleting])

  const dateSummary = useMemo(
    () => (startDate && endDate ? formatDateSummary(startDate, endDate) : null),
    [startDate, endDate],
  )

  const tripDayCount = dateSummary?.days || 0
  const multiStop = destinations.length > 1
  const segmentDaysTotal = segmentDays.reduce((sum, value) => sum + value, 0)
  const segmentDaysBalanced = !multiStop || segmentDaysTotal === tripDayCount
  const routeLabel = destinations.join(' → ')
  const dayRanges = useMemo(() => segmentDayRanges(segmentDays), [segmentDays])

  useEffect(() => {
    if (!open || !tripDayCount || destinations.length === 0) return
    if (tripDayCount < destinations.length) {
      setSegmentDays([])
      return
    }

    setSegmentDays((prev) => {
      const auto = allocateDaysPerSegment(destinations.length, tripDayCount)
      if (prev.length !== destinations.length) return auto
      const sum = prev.reduce((total, value) => total + value, 0)
      if (sum !== tripDayCount || prev.some((value) => value < 1)) return auto
      return prev
    })
  }, [open, tripDayCount, destinations.join('\u0001')])

  const handleStartChange = (value) => {
    const prevStart = startDate
    setStartDate(value)
    if (!value) return

    // Preserve the original trip length: shift check-out by the same number of
    // days the check-in moved, so 4N/5D stays 4N/5D unless the user edits the
    // check-out date manually.
    if (prevStart && endDate) {
      const tripSpan = dayOffsetBetween(prevStart, endDate)
      if (tripSpan > 0) {
        setEndDate(shiftDate(value, tripSpan))
        return
      }
    }

    if (endDate && value >= endDate) setEndDate('')
  }

  const toggleVibe = (id) => {
    setVibeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAdjustSegmentDay = (index, delta) => {
    setSegmentDays((prev) => adjustSegmentDay(prev, index, delta, tripDayCount))
  }

  const handleRemoveState = (index) => {
    if (destinations.length <= 1) return

    const daysForSegment = segmentDays[index] ?? 1
    const nextDestCount = destinations.length - 1

    if (endDate && daysForSegment > 0) {
      const newEndDate = shiftDate(endDate, -daysForSegment)
      const newTripDays = countTripDays(startDate, newEndDate)
      if (
        newTripDays >= nextDestCount &&
        newTripDays >= 1 &&
        (!startDate || newEndDate >= startDate)
      ) {
        setEndDate(newEndDate)
      }
    }

    setDestinations((prev) => prev.filter((_, i) => i !== index))
    setSegmentDays((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddState = (name) => {
    const trimmed = String(name || '').trim()
    if (!trimmed || destinations.includes(trimmed)) return
    if (destinations.length >= 4) {
      setError('You can add up to 4 stops per trip.')
      return
    }

    const nextDestCount = destinations.length + 1
    if (tripDayCount > 0 && tripDayCount < nextDestCount) {
      if (!endDate) {
        setError('Set your check-out date before adding another state.')
        return
      }
      setEndDate(shiftDate(endDate, nextDestCount - tripDayCount))
    }

    setError('')
    setDestinations((prev) => [...prev, trimmed])
    setShowAddState(false)
  }

  const reorderDestinations = (fromIndex, toIndex) => {
    if (fromIndex === null || toIndex === null || fromIndex === toIndex) return
    setDestinations((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
    setSegmentDays((prev) => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const handleStateDragStart = (event, index) => {
    setDraggingStateIndex(index)
    setDragOverStateIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  const handleStateDragOver = (event, index) => {
    event.preventDefault()
    if (draggingStateIndex === null || draggingStateIndex === index) return
    setDragOverStateIndex(index)
  }

  const handleStateDrop = (event, index) => {
    event.preventDefault()
    if (draggingStateIndex === null) return
    reorderDestinations(draggingStateIndex, index)
    setDraggingStateIndex(null)
    setDragOverStateIndex(null)
  }

  const handleStateDragEnd = () => {
    setDraggingStateIndex(null)
    setDragOverStateIndex(null)
  }

  const scrollToDays = () => {
    onClose()
    requestAnimationFrame(() => {
      document.querySelector('.day-selector-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const commitSave = useCallback(
    async (generateNewDays) => {
      const authToken = getAuthToken()
      if (!authToken) {
        setError('Sign in to save changes.')
        return
      }

      setSaving(true)
      setError('')

      try {
        const vibes = [...vibeIds]
        const { vibeLabels, paceLabel, budgetLabel, description } = buildPlanLabels(vibes, pace, budget)
        const oldPlan = initialSegmentRef.current || resolveInitialSegmentPlan(planMeta, itinerary)
        const preChangeDayCount = itinerary?.days?.length || 0

        let nextItinerary = restructureItineraryBySegments(itinerary, {
          oldDestinations: oldPlan.destinations,
          oldDaysPerDestination: oldPlan.daysPerDestination,
          destinations,
          daysPerDestination: multiStop ? segmentDays : [tripDayCount],
          startDate,
        })

        const { itinerary: resized } = resizeItineraryDays(nextItinerary, {
          startDate,
          endDate,
        })
        nextItinerary = resized

        const newDayCount = nextItinerary.days?.length || 0
        if (generateNewDays && newDayCount > preChangeDayCount) {
          const generated = await onGenerateItinerary({
            ...planMeta,
            destination: routeLabel,
            destinations,
            startDate,
            endDate,
            vibes,
            pace,
            budget,
            vibeLabels,
            paceLabel,
            budgetLabel,
            daysPerDestination: multiStop ? segmentDays : null,
          })
          nextItinerary = mergeGeneratedExtraDays(resized, generated, startDate, preChangeDayCount)
        }

        const dayCount = nextItinerary.days?.length || tripDayCount
        const patch = {
          startDate,
          endDate,
          vibes,
          pace,
          budget,
          vibeLabels,
          paceLabel,
          budgetLabel,
          description,
          destinations,
          daysPerDestination: multiStop ? segmentDays : null,
          location: `${destinations[destinations.length - 1]}, Malaysia`,
          title: buildTripTitle(dayCount, destinations),
          itinerary: nextItinerary,
        }

        const { res, trip } = await updateTrip(tripId, patch, authToken)
        if (!res.ok) throw new Error(trip.error || 'Could not save trip')

        onSaved?.({
          trip,
          itinerary: nextItinerary,
          planMeta: {
            ...planMeta,
            ...patch,
            destination: routeLabel,
            tripId,
          },
        })
        onClose()
      } catch (err) {
        setError(err.message || 'Could not save changes')
        setConfirm(null)
      } finally {
        setSaving(false)
      }
    },
    [
      vibeIds,
      pace,
      budget,
      itinerary,
      startDate,
      endDate,
      planMeta,
      tripId,
      destinations,
      segmentDays,
      multiStop,
      tripDayCount,
      routeLabel,
      onGenerateItinerary,
      onSaved,
      onClose,
    ],
  )

  const handleSave = () => {
    if (!startDate || !endDate) {
      setError('Choose both check-in and check-out dates.')
      return
    }
    if (endDate < startDate) {
      setError('Check-out must be after check-in.')
      return
    }
    if (destinations.length === 0) {
      setError('Add at least one state for this trip.')
      return
    }
    if (tripDayCount < destinations.length) {
      setError(`Need at least ${destinations.length} days for ${destinations.length} states (1 day each).`)
      return
    }
    if (multiStop && !segmentDaysBalanced) {
      setError(`Allocate all ${tripDayCount} days across your states before saving.`)
      return
    }

    const { addedDays, removedDays } = resizeItineraryDays(itinerary, { startDate, endDate })

    if (addedDays > 0) {
      setConfirm({ type: 'generate', addedDays, removedDays })
      return
    }
    if (removedDays > 0) {
      setConfirm({ type: 'trim', addedDays, removedDays })
      return
    }
    commitSave(false)
  }

  const commitDelete = useCallback(async () => {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sign in to delete this trip.')
      return
    }

    setDeleting(true)
    setError('')

    try {
      const { res } = await deleteTrip(tripId, authToken)
      if (!res.ok) throw new Error('Could not delete trip')
      onDeleted?.(tripId)
    } catch (err) {
      setError(err.message || 'Could not delete trip')
      setConfirm(null)
    } finally {
      setDeleting(false)
    }
  }, [tripId, onDeleted])

  const busy = saving || deleting
  const availableLocations = locationOptions.filter((loc) => !destinations.includes(loc.name))

  if (!open) return null

  return (
    <div className="edit-trip-modal-v2" role="dialog" aria-modal="true" aria-labelledby="edit-trip-title">
      <button type="button" className="edit-trip-backdrop" onClick={onClose} aria-label="Close" disabled={busy} />

      <div className="edit-trip-card">
        <header className="edit-trip-header">
          <div>
            <p className="edit-trip-eyebrow">Trip settings</p>
            <h2 id="edit-trip-title">Edit trip</h2>
            <p className="edit-trip-sub">Update dates, route, and travel style. Individual stops are edited below.</p>
          </div>
          <button type="button" className="edit-trip-close" onClick={onClose} aria-label="Close" disabled={busy}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="edit-trip-body">
          <section className="edit-trip-section">
            <h3 className="edit-trip-section-title">
              <span className="material-symbols-outlined">calendar_month</span> Dates
            </h3>
            <div className="edit-trip-date-row">
              <div className="edit-trip-date-field">
                <label htmlFor="edit-trip-start">Check-in</label>
                <input
                  id="edit-trip-start"
                  type="date"
                  min={today}
                  value={startDate}
                  onChange={(e) => handleStartChange(e.target.value)}
                />
              </div>
              <div className="edit-trip-date-field">
                <label htmlFor="edit-trip-end">Check-out</label>
                <input
                  id="edit-trip-end"
                  type="date"
                  min={startDate || today}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            {dateSummary && (
              <p className="edit-trip-date-summary">
                <span className="material-symbols-outlined">event</span>
                {dateSummary.text} · {dateSummary.nights} {dateSummary.nights === 1 ? 'night' : 'nights'} ·{' '}
                {dateSummary.days} {dateSummary.days === 1 ? 'day' : 'days'}
              </p>
            )}
          </section>

          <section className="edit-trip-section">
            <h3 className="edit-trip-section-title">
              <span className="material-symbols-outlined">route</span> Route &amp; states
            </h3>
            {destinations.length > 0 && (
              <p className="edit-trip-route-summary">
                <span className="material-symbols-outlined">signpost</span>
                {routeLabel}
              </p>
            )}
            {multiStop && (
              <p className="edit-trip-route-hint">Drag states to reorder your route.</p>
            )}
            {tripDayCount > 0 && tripDayCount === destinations.length && destinations.length < 4 && (
              <p className="edit-trip-route-hint">Adding a state will extend your trip by one day.</p>
            )}

            {tripDayCount > 0 && tripDayCount < destinations.length ? (
              <p className="edit-trip-warn">
                Add at least {destinations.length} days, or remove a state (minimum 1 day per state).
              </p>
            ) : (
              <ul className="edit-trip-state-list">
                {destinations.map((name, index) => {
                  const range = dayRanges[index]
                  const days = segmentDays[index] ?? 1
                  const rangeLabel =
                    range && range.count > 0
                      ? range.start === range.end
                        ? `Day ${range.start}`
                        : `Days ${range.start}–${range.end}`
                      : ''

                  return (
                    <li
                      key={`${name}-${index}`}
                      className={`edit-trip-state-row${draggingStateIndex === index ? ' dragging' : ''}${dragOverStateIndex === index && draggingStateIndex !== index ? ' drag-over' : ''}`}
                      onDragOver={multiStop ? (event) => handleStateDragOver(event, index) : undefined}
                      onDrop={multiStop ? (event) => handleStateDrop(event, index) : undefined}
                    >
                      {multiStop && (
                        <button
                          type="button"
                          className="edit-trip-state-drag"
                          draggable
                          onDragStart={(event) => handleStateDragStart(event, index)}
                          onDragEnd={handleStateDragEnd}
                          aria-label={`Drag to reorder ${name}`}
                          title="Drag to reorder"
                        >
                          <span className="material-symbols-outlined">drag_indicator</span>
                        </button>
                      )}
                      <div className="edit-trip-state-info">
                        <span className="edit-trip-state-name">{name}</span>
                        {rangeLabel && <span className="edit-trip-state-range">{rangeLabel}</span>}
                      </div>
                      <div className="edit-trip-state-actions">
                        {multiStop && (
                          <div className="edit-trip-state-days">
                            <button
                              type="button"
                              className="edit-trip-state-btn"
                              onClick={() => handleAdjustSegmentDay(index, -1)}
                              disabled={days <= 1}
                              aria-label={`Fewer days in ${name}`}
                            >
                              <span className="material-symbols-outlined">remove</span>
                            </button>
                            <span className="edit-trip-state-count">
                              {days} {days === 1 ? 'day' : 'days'}
                            </span>
                            <button
                              type="button"
                              className="edit-trip-state-btn"
                              onClick={() => handleAdjustSegmentDay(index, 1)}
                              aria-label={`More days in ${name}`}
                            >
                              <span className="material-symbols-outlined">add</span>
                            </button>
                          </div>
                        )}
                        {!multiStop && (
                          <span className="edit-trip-state-count solo">
                            {tripDayCount} {tripDayCount === 1 ? 'day' : 'days'}
                          </span>
                        )}
                        {destinations.length > 1 && (
                          <button
                            type="button"
                            className="edit-trip-state-remove"
                            onClick={() => handleRemoveState(index)}
                            aria-label={`Remove ${name}`}
                          >
                            <span className="material-symbols-outlined">delete</span>
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {multiStop && tripDayCount >= destinations.length && (
              <p className={`edit-trip-state-total${segmentDaysBalanced ? ' ok' : ' err'}`}>
                {segmentDaysTotal} of {tripDayCount} days allocated
              </p>
            )}

            {showAddState ? (
              <div className="edit-trip-add-state-panel">
                <p className="edit-trip-label">Add state</p>
                {availableLocations.length > 0 ? (
                  <div className="edit-trip-add-state-chips">
                    {availableLocations.slice(0, 8).map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        className="edit-trip-add-chip"
                        onClick={() => handleAddState(loc.name)}
                      >
                        {loc.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="edit-trip-hint">All suggested states are already on this route.</p>
                )}
                <button type="button" className="edit-trip-link-btn" onClick={() => setShowAddState(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="edit-trip-add-state-btn"
                onClick={() => {
                  setError('')
                  setShowAddState(true)
                }}
                disabled={destinations.length >= 4}
              >
                <span className="material-symbols-outlined">add_location</span>
                Add state
              </button>
            )}
          </section>

          <section className="edit-trip-section">
            <h3 className="edit-trip-section-title">
              <span className="material-symbols-outlined">tune</span> Travel style
            </h3>
            <p className="edit-trip-hint">Style changes update your trip profile. Existing stops are kept as-is.</p>

            <p className="edit-trip-label">Vibe</p>
            <div className="edit-trip-option-grid">
              {VIBE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`edit-trip-option${vibeIds.has(option.id) ? ' active' : ''}`}
                  onClick={() => toggleVibe(option.id)}
                >
                  <span className="material-symbols-outlined">{option.icon}</span>
                  <span className="edit-trip-option-label">{option.label}</span>
                </button>
              ))}
            </div>

            <p className="edit-trip-label">Pace</p>
            <div className="edit-trip-chip-row">
              {PACE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`edit-trip-chip${pace === option.id ? ' active' : ''}`}
                  onClick={() => setPace(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <p className="edit-trip-label">Budget</p>
            <div className="edit-trip-chip-row">
              {BUDGET_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`edit-trip-chip${budget === option.id ? ' active' : ''}`}
                  onClick={() => setBudget(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="edit-trip-section edit-trip-places-note">
            <h3 className="edit-trip-section-title">
              <span className="material-symbols-outlined">place</span> Places
            </h3>
            <p>Add, remove, or reorder stops using the day tabs and + menu on this page.</p>
            <button type="button" className="edit-trip-link-btn" onClick={scrollToDays}>
              Jump to day view
              <span className="material-symbols-outlined">arrow_downward</span>
            </button>
          </section>
        </div>

        {error && <p className="edit-trip-error">{error}</p>}

        <footer className="edit-trip-footer">
          {canDeleteTrip && (
            <button
              type="button"
              className="edit-trip-btn danger"
              onClick={() => setConfirm({ type: 'delete' })}
              disabled={busy}
            >
              <span className="material-symbols-outlined">delete</span>
              Delete trip
            </button>
          )}
          <div className="edit-trip-footer-end">
            <button type="button" className="edit-trip-btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="edit-trip-btn primary" onClick={handleSave} disabled={busy}>
              {saving ? (
                <>
                  <span className="material-symbols-outlined spin">hourglass_empty</span> Saving…
                </>
              ) : (
                'Save changes'
              )}
            </button>
          </div>
        </footer>

        {confirm?.type === 'generate' && (
          <div className="edit-trip-confirm" role="alertdialog" aria-labelledby="edit-trip-confirm-title">
            <div className="edit-trip-confirm-card">
              <h3 id="edit-trip-confirm-title">Generate new days?</h3>
              <p>
                Your trip is {confirm.addedDays} {confirm.addedDays === 1 ? 'day' : 'days'} longer. Generate AI
                activities for the new {confirm.addedDays === 1 ? 'day' : 'days'}, or add empty days to fill in
                yourself?
              </p>
              <div className="edit-trip-confirm-actions">
                <button
                  type="button"
                  className="edit-trip-btn ghost"
                  onClick={() => commitSave(false)}
                  disabled={saving}
                >
                  Empty days only
                </button>
                <button
                  type="button"
                  className="edit-trip-btn primary"
                  onClick={() => commitSave(true)}
                  disabled={saving}
                >
                  Generate activities
                </button>
              </div>
            </div>
          </div>
        )}

        {confirm?.type === 'delete' && (
          <div className="edit-trip-confirm" role="alertdialog" aria-labelledby="edit-trip-delete-title">
            <div className="edit-trip-confirm-card">
              <h3 id="edit-trip-delete-title">Delete this trip?</h3>
              <p>
                This will permanently remove the trip and its entire itinerary. This action cannot be undone.
              </p>
              <div className="edit-trip-confirm-actions">
                <button
                  type="button"
                  className="edit-trip-btn ghost"
                  onClick={() => setConfirm(null)}
                  disabled={deleting}
                >
                  Go back
                </button>
                <button
                  type="button"
                  className="edit-trip-btn danger-solid"
                  onClick={commitDelete}
                  disabled={deleting}
                >
                  {deleting ? (
                    <>
                      <span className="material-symbols-outlined spin">hourglass_empty</span> Deleting…
                    </>
                  ) : (
                    'Delete trip'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {confirm?.type === 'trim' && (
          <div className="edit-trip-confirm" role="alertdialog" aria-labelledby="edit-trip-trim-title">
            <div className="edit-trip-confirm-card">
              <h3 id="edit-trip-trim-title">Remove extra days?</h3>
              <p>
                Shortening your trip will remove {confirm.removedDays}{' '}
                {confirm.removedDays === 1 ? 'day' : 'days'} and any activities on{' '}
                {confirm.removedDays === 1 ? 'that day' : 'those days'}.
              </p>
              <div className="edit-trip-confirm-actions">
                <button type="button" className="edit-trip-btn ghost" onClick={() => setConfirm(null)} disabled={saving}>
                  Go back
                </button>
                <button
                  type="button"
                  className="edit-trip-btn primary"
                  onClick={() => commitSave(false)}
                  disabled={saving}
                >
                  Remove days
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
