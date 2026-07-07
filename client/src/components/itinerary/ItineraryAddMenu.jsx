import { useEffect, useId, useState } from 'react'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { getPlaceImageUrl } from '../../utils/resolveImage.js'

const ADD_OPTIONS = [
  {
    id: 'place',
    icon: 'location_on',
    title: 'Place',
    desc: 'Attractions, stays, restaurants, or any spot',
  },
  {
    id: 'flight',
    icon: 'flight',
    title: 'Flight',
    desc: 'Add a flight segment to your trip',
  },
  {
    id: 'train',
    icon: 'train',
    title: 'Train',
    desc: 'KTMB & regional rail connections',
  },
]

const MALAYSIA_TRANSPORT_HUBS = {
  flight: [
    {
      name: 'Kuala Lumpur International Airport (KLIA)',
      formattedAddress: 'Terminal 1, Sepang, Selangor',
      lat: 2.7456,
      lng: 101.7099,
    },
    {
      name: 'Kuala Lumpur International Airport 2 (klia2)',
      formattedAddress: 'Terminal 2, Sepang, Selangor',
      lat: 2.7382,
      lng: 101.6989,
    },
    {
      name: 'Penang International Airport (PEN)',
      formattedAddress: 'Bayan Lepas, Penang',
      lat: 5.2971,
      lng: 100.2769,
    },
    {
      name: 'Senai International Airport (JHB)',
      formattedAddress: 'Senai, Johor',
      lat: 1.6413,
      lng: 103.6696,
    },
    {
      name: 'Kota Kinabalu International Airport (BKI)',
      formattedAddress: 'Kota Kinabalu, Sabah',
      lat: 5.9372,
      lng: 116.0512,
    },
    {
      name: 'Kuching International Airport (KCH)',
      formattedAddress: 'Kuching, Sarawak',
      lat: 1.4847,
      lng: 110.3469,
    },
    {
      name: 'Langkawi International Airport (LGK)',
      formattedAddress: 'Langkawi, Kedah',
      lat: 6.3297,
      lng: 99.7286,
    },
    {
      name: 'Sultan Abdul Aziz Shah Airport (Subang)',
      formattedAddress: 'Subang, Selangor',
      lat: 3.1306,
      lng: 101.5494,
    },
  ],
  train: [
    { name: 'KL Sentral', formattedAddress: 'Kuala Lumpur', lat: 3.1342, lng: 101.6869 },
    {
      name: 'Butterworth Railway Station',
      formattedAddress: 'Butterworth, Penang',
      lat: 5.3991,
      lng: 100.3638,
    },
    { name: 'Ipoh Railway Station', formattedAddress: 'Ipoh, Perak', lat: 4.5975, lng: 101.0753 },
    {
      name: 'Johor Bahru Sentral',
      formattedAddress: 'Johor Bahru, Johor',
      lat: 1.4632,
      lng: 103.7644,
    },
    {
      name: 'Gemas Railway Station',
      formattedAddress: 'Gemas, Negeri Sembilan',
      lat: 2.5833,
      lng: 102.3986,
    },
    {
      name: 'Padang Besar Railway Station',
      formattedAddress: 'Padang Besar, Perlis',
      lat: 6.6614,
      lng: 100.3236,
    },
    { name: 'Kuala Lumpur Railway Station', formattedAddress: 'Kuala Lumpur', lat: 3.1395, lng: 101.6938 },
    { name: 'Taiping Railway Station', formattedAddress: 'Taiping, Perak', lat: 4.8512, lng: 100.7412 },
  ],
}

function filterLocalTransportHubs(query, kind) {
  const hubs = MALAYSIA_TRANSPORT_HUBS[kind] || []
  const q = String(query || '').trim().toLowerCase()
  if (!q) return hubs.slice(0, 6)
  return hubs
    .filter(
      (hub) =>
        hub.name.toLowerCase().includes(q) || hub.formattedAddress.toLowerCase().includes(q),
    )
    .slice(0, 8)
}

function mergeTransportSuggestions(local, remote) {
  const seen = new Set()
  const merged = []

  for (const item of [...local, ...remote]) {
    const key = item.name?.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }

  return merged.slice(0, 10)
}

function formatCategoryLabel(cat) {
  if (!cat) return 'Culture'
  return cat
    .split(' ')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

function DayPicker({ days, value, onChange, id }) {
  if (!days?.length) return null

  return (
    <div className="itin-add-field">
      <span className="itin-add-field-label" id={id}>
        Add to day
      </span>
      <div className="itin-add-day-picker" role="group" aria-labelledby={id}>
        {days.map((day, index) => (
          <button
            key={day.id}
            type="button"
            className={`itin-add-day-chip${value === index ? ' active' : ''}`}
            aria-pressed={value === index}
            onClick={() => onChange(index)}
          >
            <span className="itin-add-day-chip-num">Day {day.num}</span>
            <span className="itin-add-day-chip-label">{day.tabLabel}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function TransportLocationField({ kind, value, onChange, onSelect, label }) {
  const listId = useId()
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [googleConfigured, setGoogleConfigured] = useState(true)

  useEffect(() => {
    const q = value.trim()
    const local = filterLocalTransportHubs(q, kind)

    if (q.length < 2) {
      setSuggestions(local)
      setLoading(false)
      return undefined
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ q, limit: '8', kind })
        const res = await fetch(`/api/google/transport/search?${params}`)
        const data = await res.json().catch(() => ({ results: [], configured: false }))
        setGoogleConfigured(data.configured !== false)
        const remote = Array.isArray(data.results) ? data.results : []
        setSuggestions(mergeTransportSuggestions(local, remote))
      } catch {
        setGoogleConfigured(false)
        setSuggestions(local)
      } finally {
        setLoading(false)
      }
    }, 280)

    return () => clearTimeout(timer)
  }, [value, kind])

  const showSuggestions = open && (loading || suggestions.length > 0)

  const handleSelect = (item) => {
    onSelect({
      lat: item.lat ?? null,
      lng: item.lng ?? null,
      formattedAddress: item.formattedAddress || null,
    })
    onChange(item.name)
    setOpen(false)
  }

  return (
    <label className="itin-add-field itin-add-field--location">
      <span className="itin-add-field-label">{label}</span>
      <input
        type="text"
        className="itin-add-search-input"
        placeholder={kind === 'flight' ? 'e.g. KLIA, Penang Airport' : 'e.g. KL Sentral, Butterworth'}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 160)
        }}
        role="combobox"
        aria-expanded={showSuggestions}
        aria-controls={listId}
        autoComplete="off"
      />
      {showSuggestions && (
        <div className="itin-add-location-suggest" id={listId} role="listbox">
          {loading && (
            <p className="itin-add-search-status">
              <span className="material-symbols-outlined spin">hourglass_empty</span> Searching…
            </p>
          )}
          {!loading && suggestions.length === 0 && (
            <p className="itin-add-search-status">No hubs found. Try another name or type freely.</p>
          )}
          {!loading &&
            suggestions.map((item) => (
              <button
                key={`${item.name}-${item.formattedAddress}`}
                type="button"
                className="itin-add-location-suggest-item"
                role="option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(item)}
              >
                <span className="material-symbols-outlined itin-add-location-suggest-icon">
                  {kind === 'flight' ? 'flight' : 'train'}
                </span>
                <span className="itin-add-location-suggest-body">
                  <span className="itin-add-location-suggest-name">{item.name}</span>
                  <span className="itin-add-location-suggest-meta">
                    {item.formattedAddress || 'Malaysia'}
                  </span>
                </span>
              </button>
            ))}
          {!loading && !googleConfigured && suggestions.length > 0 && (
            <p className="itin-add-search-status itin-add-search-status--hint">
              Showing popular Malaysian hubs
            </p>
          )}
        </div>
      )}
    </label>
  )
}

function AddPlaceSearch({ days, activeDayIndex, onSelect, onBack }) {
  const { tPlaceName } = useLanguage()
  const [query, setQuery] = useState('')
  const [dayIndex, setDayIndex] = useState(activeDayIndex)
  const [dbPlaces, setDbPlaces] = useState([])
  const [googlePlaces, setGooglePlaces] = useState([])
  const [loading, setLoading] = useState(false)
  const [googleError, setGoogleError] = useState(false)

  useEffect(() => {
    setDayIndex(activeDayIndex)
  }, [activeDayIndex])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setDbPlaces([])
      setGooglePlaces([])
      setGoogleError(false)
      return undefined
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      setGoogleError(false)
      try {
        const params = new URLSearchParams({ q, limit: '8' })
        const [dbRes, googleRes] = await Promise.all([
          fetch(`/api/places?${params}`),
          fetch(`/api/google/places/search?${params}`),
        ])

        const dbData = await dbRes.json().catch(() => [])
        setDbPlaces(Array.isArray(dbData) ? dbData : [])

        const googleData = await googleRes.json().catch(() => ({ results: [], configured: false }))
        if (!googleRes.ok) {
          setGooglePlaces([])
          setGoogleError(true)
        } else {
          setGooglePlaces(Array.isArray(googleData.results) ? googleData.results : [])
        }
      } catch {
        setDbPlaces([])
        setGooglePlaces([])
        setGoogleError(true)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  const q = query.trim()
  const hasResults = dbPlaces.length > 0 || googlePlaces.length > 0
  const dayLabel = days?.[dayIndex]?.num ?? dayIndex + 1

  const handlePlacePick = (place) => {
    onSelect(place, dayIndex)
  }

  return (
    <div className="itin-add-search" role="dialog" aria-label="Add a place">
      <div className="itin-add-search-header">
        <button type="button" className="itin-add-search-back" onClick={onBack} aria-label="Back">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h3 className="itin-add-search-title">Add a place</h3>
      </div>

      <DayPicker days={days} value={dayIndex} onChange={setDayIndex} id="itin-add-place-day" />

      <input
        type="search"
        className="itin-add-search-input"
        placeholder="Search TravelAh or Google Maps…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="itin-add-search-results">
        {loading && (
          <p className="itin-add-search-status">
            <span className="material-symbols-outlined spin">hourglass_empty</span> Searching…
          </p>
        )}
        {!loading && q.length < 2 && (
          <p className="itin-add-search-status">Type at least 2 characters to search.</p>
        )}
        {!loading && q.length >= 2 && !hasResults && !googleError && (
          <p className="itin-add-search-status">No places found. Try another keyword.</p>
        )}
        {!loading && googleError && (
          <p className="itin-add-search-status">Google search is temporarily unavailable.</p>
        )}

        {!loading && dbPlaces.length > 0 && (
          <>
            <p className="itin-add-search-section">From TravelAh · Day {dayLabel}</p>
            {dbPlaces.map((place) => {
              const id = place.id || place._id
              const img = getPlaceImageUrl(place.coverImage)
              const cat = place.categories?.[0]
              return (
                <button
                  key={id}
                  type="button"
                  className="itin-add-search-item"
                  onClick={() => handlePlacePick(place)}
                >
                  {img ? (
                    <img src={img} alt="" className="itin-add-search-thumb" />
                  ) : (
                    <span className="itin-add-search-thumb itin-add-search-thumb--empty">
                      <span className="material-symbols-outlined">location_on</span>
                    </span>
                  )}
                  <span className="itin-add-search-item-body">
                    <span className="itin-add-search-item-name">{tPlaceName(place.name)}</span>
                    <span className="itin-add-search-item-meta">
                      {place.state ? `${place.state} · ` : ''}
                      {formatCategoryLabel(cat)}
                    </span>
                  </span>
                  <span className="material-symbols-outlined itin-add-search-item-arrow">add</span>
                </button>
              )
            })}
          </>
        )}

        {!loading && googlePlaces.length > 0 && (
          <>
            <p className="itin-add-search-section">From Google Maps · Day {dayLabel}</p>
            {googlePlaces.map((place) => (
              <button
                key={place.id}
                type="button"
                className="itin-add-search-item itin-add-search-item--google"
                onClick={() => handlePlacePick(place)}
              >
                <span className="itin-add-search-thumb itin-add-search-thumb--google">
                  <span className="material-symbols-outlined">map</span>
                </span>
                <span className="itin-add-search-item-body">
                  <span className="itin-add-search-item-name">{tPlaceName(place.name)}</span>
                  <span className="itin-add-search-item-meta">
                    {place.formattedAddress || 'Malaysia'}
                    {place.rating != null ? ` · ${place.rating.toFixed(1)}★` : ''}
                  </span>
                </span>
                <span className="material-symbols-outlined itin-add-search-item-arrow">add</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function AddTransportForm({ type, days, activeDayIndex, onSubmit, onBack }) {
  const isFlight = type === 'flight'
  const [number, setNumber] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [location, setLocation] = useState('')
  const [locationMeta, setLocationMeta] = useState({ lat: null, lng: null, formattedAddress: null })
  const [legType, setLegType] = useState('arrival')
  const [dayIndex, setDayIndex] = useState(activeDayIndex)
  const [error, setError] = useState('')

  useEffect(() => {
    setDayIndex(activeDayIndex)
  }, [activeDayIndex])

  const isArrival = legType === 'arrival'
  const timeLabel = isArrival ? 'Arrival time' : 'Departure time'
  const locationLabel = isArrival ? 'Arrival location' : 'Departure location'
  const dayLabel = days?.[dayIndex]?.num ?? dayIndex + 1

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!number.trim() || !scheduleTime || !location.trim()) {
      setError('Please fill in all fields.')
      return
    }
    setError('')
    onSubmit(
      {
        number: number.trim(),
        scheduleTime,
        arrivalTime: scheduleTime,
        location: location.trim(),
        legType,
        lat: locationMeta.lat,
        lng: locationMeta.lng,
        formattedAddress: locationMeta.formattedAddress,
      },
      dayIndex,
    )
  }

  return (
    <form
      className="itin-add-form"
      onSubmit={handleSubmit}
      role="dialog"
      aria-label={isFlight ? 'Add flight' : 'Add train'}
    >
      <div className="itin-add-search-header">
        <button type="button" className="itin-add-search-back" onClick={onBack} aria-label="Back">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h3 className="itin-add-search-title">{isFlight ? 'Add flight' : 'Add train'}</h3>
      </div>

      <div className="itin-add-form-body">
        <DayPicker days={days} value={dayIndex} onChange={setDayIndex} id="itin-add-transport-day" />

        <div className="itin-add-field">
          <span className="itin-add-field-label">Type</span>
          <div className="itin-add-leg-toggle" role="group" aria-label="Arrival or departure">
            <button
              type="button"
              className={`itin-add-leg-chip${isArrival ? ' active' : ''}`}
              aria-pressed={isArrival}
              onClick={() => setLegType('arrival')}
            >
              <span className="material-symbols-outlined">
                {isFlight ? 'flight_land' : 'train'}
              </span>
              Arrival
            </button>
            <button
              type="button"
              className={`itin-add-leg-chip${!isArrival ? ' active' : ''}`}
              aria-pressed={!isArrival}
              onClick={() => setLegType('departure')}
            >
              <span className="material-symbols-outlined">
                {isFlight ? 'flight_takeoff' : 'train'}
              </span>
              Departure
            </button>
          </div>
        </div>

        <label className="itin-add-field">
          <span className="itin-add-field-label">{isFlight ? 'Flight number' : 'Train number'}</span>
          <input
            type="text"
            className="itin-add-search-input"
            placeholder={isFlight ? 'e.g. MH370, AK612' : 'e.g. ETS9425, KTMB12'}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            autoFocus
          />
        </label>

        <label className="itin-add-field">
          <span className="itin-add-field-label">{timeLabel}</span>
          <input
            type="time"
            className="itin-add-search-input"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
          />
        </label>

        <TransportLocationField
          kind={type}
          label={locationLabel}
          value={location}
          onChange={(next) => {
            setLocation(next)
            setLocationMeta({ lat: null, lng: null, formattedAddress: null })
          }}
          onSelect={setLocationMeta}
        />

        {error && <p className="itin-add-form-error">{error}</p>}

        <button type="submit" className="itin-add-form-submit">
          <span className="material-symbols-outlined">
            {isFlight ? (isArrival ? 'flight_land' : 'flight_takeoff') : 'train'}
          </span>
          Add to Day {dayLabel}
        </button>
      </div>
    </form>
  )
}

export default function ItineraryAddMenu({
  open,
  onOpen,
  onClose,
  days = [],
  activeDayIndex = 0,
  onAddPlace,
  onAddTransport,
}) {
  const { t } = useLanguage()
  const [view, setView] = useState('menu')

  useEffect(() => {
    if (!open) setView('menu')
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleOption = (id) => {
    setView(id)
  }

  const handlePlaceSelect = (place, dayIndex) => {
    onAddPlace?.(place, dayIndex)
    onClose()
  }

  const handleTransportSubmit = (details, dayIndex) => {
    if (view === 'flight' || view === 'train') {
      onAddTransport?.(view, details, dayIndex)
      onClose()
    }
  }

  const isFormView = view === 'place' || view === 'flight' || view === 'train'

  return (
    <div className={`itin-add-anchor${open ? ' open' : ''}`}>
      <button
        type="button"
        className={`itin-add-fab${open ? ' open' : ''}`}
        onClick={() => (open ? onClose() : onOpen())}
        aria-label={open ? 'Close add menu' : 'Add to day'}
        aria-expanded={open}
      >
        <span className="material-symbols-outlined">{open ? 'close' : 'add'}</span>
        <span className="itin-add-fab-label">{open ? t('Close') : t('Add')}</span>
      </button>

      {open && (
        <div className="itin-add-dropdown">
          {view === 'menu' && (
            <div className="itin-add-menu" role="menu" aria-label="Add to itinerary">
              {ADD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="itin-add-menu-item"
                  role="menuitem"
                  onClick={() => handleOption(opt.id)}
                >
                  <span className="itin-add-menu-icon">
                    <span className="material-symbols-outlined">{opt.icon}</span>
                  </span>
                  <span className="itin-add-menu-text">
                    <span className="itin-add-menu-title">{opt.title}</span>
                    <span className="itin-add-menu-desc">{opt.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {view === 'place' && (
            <AddPlaceSearch
              days={days}
              activeDayIndex={activeDayIndex}
              onSelect={handlePlaceSelect}
              onBack={() => setView('menu')}
            />
          )}

          {view === 'flight' && (
            <AddTransportForm
              type="flight"
              days={days}
              activeDayIndex={activeDayIndex}
              onSubmit={handleTransportSubmit}
              onBack={() => setView('menu')}
            />
          )}

          {view === 'train' && (
            <AddTransportForm
              type="train"
              days={days}
              activeDayIndex={activeDayIndex}
              onSubmit={handleTransportSubmit}
              onBack={() => setView('menu')}
            />
          )}

          {!isFormView && (
            <button type="button" className="itin-add-close" onClick={onClose}>
              <span className="material-symbols-outlined">close</span>
              Close
            </button>
          )}
        </div>
      )}
    </div>
  )
}
