import { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import '../styles/themed-date-picker.css'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function pad(value) {
  return String(value).padStart(2, '0')
}

function toIso(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`
}

function parseIso(iso) {
  if (!iso) return null
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null
  return date
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isBeforeDay(a, b) {
  return startOfDay(a) < startOfDay(b)
}

function localeForLanguage(language) {
  if (language === 'zh-CN') return 'zh-CN'
  if (language === 'ms') return 'ms-MY'
  return 'en-MY'
}

export default function ThemedDatePicker({ id, label, value, onChange, min, max, className = '' }) {
  const { t, language } = useLanguage()
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => parseIso(value) || parseIso(min) || new Date())
  const ref = useRef(null)

  const minDate = parseIso(min)
  const maxDate = parseIso(max)
  const selectedDate = parseIso(value)
  const locale = localeForLanguage(language)

  const today = useMemo(() => startOfDay(new Date()), [])

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

  useEffect(() => {
    if (selectedDate) setViewDate(selectedDate)
  }, [value, selectedDate])

  const monthLabel = viewDate.toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  })

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const startOffset = firstDay.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let index = 0; index < startOffset; index += 1) cells.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(year, month, day))
    }
    return cells
  }, [viewDate])

  function isDisabled(day) {
    if (!day) return true
    if (minDate && isBeforeDay(day, minDate)) return true
    if (maxDate && isBeforeDay(maxDate, day)) return true
    return false
  }

  function selectDay(day) {
    if (!day || isDisabled(day)) return
    onChange(toIso(day.getFullYear(), day.getMonth(), day.getDate()))
    setOpen(false)
  }

  function goMonth(delta) {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const displayValue = selectedDate
    ? selectedDate.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''

  return (
    <div className={`themed-date-picker date-field${open ? ' open' : ''}${className ? ` ${className}` : ''}`} ref={ref}>
      <label className="date-label" htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        id={id}
        className="themed-date-trigger date-input"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={displayValue ? 'themed-date-value' : 'themed-date-placeholder'}>
          {displayValue || t('Select date')}
        </span>
        <span className="material-symbols-outlined themed-date-icon" aria-hidden="true">
          calendar_month
        </span>
      </button>

      {open ? (
        <div className="themed-date-dropdown" role="dialog" aria-label={label}>
          <div className="themed-date-header">
            <button type="button" className="themed-date-nav" onClick={() => goMonth(-1)} aria-label={t('Previous month')}>
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <span className="themed-date-month">{monthLabel}</span>
            <button type="button" className="themed-date-nav" onClick={() => goMonth(1)} aria-label={t('Next month')}>
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>

          <div className="themed-date-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <span key={day} className="themed-date-weekday">
                {day}
              </span>
            ))}
          </div>

          <div className="themed-date-grid">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <span key={`empty-${index}`} className="themed-date-cell empty" aria-hidden="true" />
              }

              const selected = selectedDate && sameDay(day, selectedDate)
              const isToday = sameDay(day, today)
              const disabled = isDisabled(day)

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  className={`themed-date-cell day${selected ? ' selected' : ''}${isToday ? ' today' : ''}${disabled ? ' disabled' : ''}`}
                  onClick={() => selectDay(day)}
                  disabled={disabled}
                  aria-label={day.toLocaleDateString(locale, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  aria-pressed={selected}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>

          <div className="themed-date-footer">
            <button
              type="button"
              className="themed-date-action"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              {t('Clear')}
            </button>
            <button
              type="button"
              className="themed-date-action"
              disabled={isDisabled(today)}
              onClick={() => selectDay(today)}
            >
              {t('Today')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
