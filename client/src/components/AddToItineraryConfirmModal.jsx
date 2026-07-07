import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { translateTemplate } from '../i18n/template.js'
import '../styles/add-to-itinerary-confirm.css'

export default function AddToItineraryConfirmModal({ confirm, loading, onConfirm, onCancel }) {
  const { t } = useLanguage()
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [dayOpen, setDayOpen] = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => {
    if (!confirm) return undefined
    setSelectedDayIndex(confirm.dayIndex ?? 0)
    setDayOpen(false)
  }, [confirm])

  useEffect(() => {
    if (!confirm) return undefined

    function onKeyDown(event) {
      if (event.key !== 'Escape' || loading) return
      if (dayOpen) {
        setDayOpen(false)
        return
      }
      onCancel?.()
    }

    function onDocClick(event) {
      if (!dayOpen) return
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setDayOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onDocClick)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onDocClick)
    }
  }, [confirm, loading, onCancel, dayOpen])

  if (!confirm) return null

  const { place, tripName, dayOptions } = confirm
  const selectedDay = dayOptions.find((option) => option.index === selectedDayIndex) || dayOptions[0]

  return (
    <div className="add-itin-confirm" role="dialog" aria-modal="true" aria-labelledby="add-itin-title">
      <button
        type="button"
        className="add-itin-confirm-backdrop"
        onClick={onCancel}
        disabled={loading}
        aria-label={t('Cancel')}
      />
      <div className="add-itin-confirm-card">
        <h3 id="add-itin-title">{t('Add to itinerary?')}</h3>
        <p className="add-itin-confirm-lead">
          {translateTemplate(t, 'Add {{place}} to your trip:', { place: place?.name || t('this place') })}
        </p>
        <dl className="add-itin-confirm-meta">
          <div className="add-itin-confirm-row">
            <dt>{t('Trip')}</dt>
            <dd>{tripName}</dd>
          </div>
          <div className={`add-itin-confirm-row is-select${dayOpen ? ' open' : ''}`}>
            <dt>{t('Day')}</dt>
            <dd>
              <div className={`add-itin-day-picker${dayOpen ? ' open' : ''}`} ref={pickerRef}>
                <button
                  type="button"
                  className="add-itin-day-trigger"
                  onClick={() => !loading && setDayOpen((prev) => !prev)}
                  disabled={loading}
                  aria-haspopup="listbox"
                  aria-expanded={dayOpen}
                  aria-label={t('Choose day')}
                >
                  <span className="add-itin-day-value">{selectedDay?.label}</span>
                  <span className="material-symbols-outlined add-itin-day-caret" aria-hidden="true">
                    expand_more
                  </span>
                </button>
                {dayOpen && (
                  <ul className="add-itin-day-menu" role="listbox">
                    {dayOptions.map((option) => (
                      <li key={option.index}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={option.index === selectedDayIndex}
                          className={`add-itin-day-option${
                            option.index === selectedDayIndex ? ' selected' : ''
                          }`}
                          onClick={() => {
                            setSelectedDayIndex(option.index)
                            setDayOpen(false)
                          }}
                        >
                          <span className="add-itin-day-option-label">{option.label}</span>
                          {option.index === selectedDayIndex && (
                            <span className="material-symbols-outlined add-itin-day-check" aria-hidden="true">
                              check
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </dd>
          </div>
        </dl>
        <p className="add-itin-confirm-note">
          {t('You can still edit this stop anytime in My Trips.')}
        </p>
        <div className="add-itin-confirm-actions">
          <button type="button" className="add-itin-btn ghost" onClick={onCancel} disabled={loading}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="add-itin-btn primary"
            onClick={() => onConfirm(selectedDayIndex)}
            disabled={loading}
          >
            {loading ? t('Adding…') : t('Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
