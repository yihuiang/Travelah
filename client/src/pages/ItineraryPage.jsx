import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import HomeTopNav from '../components/home/HomeTopNav.jsx'
import ItineraryView from '../components/itinerary/ItineraryView.jsx'
import TravelahLoader from '../components/TravelahLoader.jsx'
import { useAuth, getAuthToken } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { mergePlanMeta } from '../utils/itineraryMeta.js'
import { destinationsFromTrip } from '../utils/tripDisplay.js'
import { fetchTrip, updateTripItinerary, saveTrip } from '../utils/tripsApi.js'
import '../styles/home-v2.css'
import '../styles/itinerary-v2.css'

function isUsableDestination(value) {
  const label = String(value || '').trim()
  return label.length > 0 && label.toLowerCase() !== 'malaysia'
}

function expandDestinationList(list) {
  const expanded = []
  for (const item of list || []) {
    const label = String(item || '').trim()
    if (!label) continue
    if (/\s*(?:→|->|—|–|➜|»|>)\s*|\s+\band\b\s+|\s+then\s+|\s*&\s*/i.test(label)) {
      expanded.push(...destinationsFromTrip({ location: `${label}, Malaysia` }))
      continue
    }
    if (isUsableDestination(label)) expanded.push(label)
  }
  return expanded
}

function isValidItinerary(data) {
  return Boolean(
    data?.days?.length > 0 &&
      data.days.some((day) => Array.isArray(day.activities) && day.activities.length > 0),
  )
}

function planFromSavedTrip(trip) {
  const destinations = destinationsFromTrip(trip)
  const destination = destinations.length > 1 ? destinations.join(' → ') : destinations[0] || ''
  return {
    tripId: trip.id,
    location: trip.location || null,
    title: trip.title || null,
    destination,
    destinations,
    startDate: trip.startDate || null,
    endDate: trip.endDate || null,
    vibes: trip.vibes || [],
    pace: trip.pace || 'balanced',
    budget: trip.budget || 'mid',
    daysPerDestination: trip.daysPerDestination || null,
    vibeLabels: trip.vibeLabels || trip.description || null,
    paceLabel: trip.paceLabel || null,
    budgetLabel: trip.budgetLabel || null,
    packingList: Array.isArray(trip.packingList) ? trip.packingList : [],
    budgetItems: Array.isArray(trip.budgetItems) ? trip.budgetItems : [],
    budgetCurrency: trip.budgetCurrency || null,
  }
}

function resolveGenerateDestinations(plan, savedTrip) {
  const candidates = []
  const add = (list) => {
    const normalized = expandDestinationList(list)
    if (!normalized.length) return
    const key = normalized.join('\u0001')
    if (!candidates.some((entry) => entry.join('\u0001') === key)) {
      candidates.push(normalized)
    }
  }

  if (savedTrip) {
    add(destinationsFromTrip(savedTrip))
    add(savedTrip.destinations)
  }
  add(destinationsFromTrip(plan))
  add(plan.destinations)
  if (isUsableDestination(plan.destination)) {
    add([plan.destination.trim()])
  }
  if (plan.title) {
    add(destinationsFromTrip({ title: plan.title, location: plan.location }))
  }

  return candidates
}

async function callGenerate(destinations, plan) {
  const res = await fetch('/api/itinerary/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinations,
      startDate: plan.startDate || null,
      endDate: plan.endDate || null,
      vibes: plan.vibes || [],
      pace: plan.pace || 'balanced',
      budget: plan.budget || 'mid',
      daysPerDestination: plan.daysPerDestination?.length ? plan.daysPerDestination : null,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Could not load itinerary')
  if (data.empty) throw new Error(data.message || 'No places found for this destination')
  return data
}

async function generateItinerary(plan, savedTrip = null) {
  const candidateLists = resolveGenerateDestinations(plan, savedTrip)
  if (!candidateLists.length) {
    throw new Error('No destination found for this trip. Try replanning from the Plan page.')
  }

  let lastError = null
  for (const destinations of candidateLists) {
    try {
      return await callGenerate(destinations, plan)
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Could not load itinerary')
}

export default function ItineraryPage() {
  const { tripId: tripIdParam } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { token, sessionReady } = useAuth()
  const { t } = useLanguage()
  const navState = location.state

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [toast, setToast] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const autoSaveAttemptedRef = useRef(false)

  const tripId = tripIdParam ? decodeURIComponent(tripIdParam) : null

  const navMeta = useMemo(() => {
    const destinations = navState?.destinations || destinationsFromTrip(navState || {})
    const destination =
      navState?.destination ||
      (destinations.length > 1 ? destinations.join(' → ') : destinations[0] || '')
    return {
      title: navState?.title || null,
      location: navState?.location || null,
      destination,
      destinations,
      startDate: navState?.startDate || null,
      endDate: navState?.endDate || null,
      vibes: navState?.vibes || [],
      pace: navState?.pace || 'balanced',
      budget: navState?.budget || 'mid',
      daysPerDestination: navState?.daysPerDestination || null,
      vibeLabels: navState?.vibeLabels || null,
      paceLabel: navState?.paceLabel || null,
      budgetLabel: navState?.budgetLabel || null,
    }
  }, [navState])

  const [tripMeta, setTripMeta] = useState(navMeta)
  const [generated, setGenerated] = useState(() =>
    !tripId && isValidItinerary(navState?.itinerary) ? navState.itinerary : null,
  )
  const [fetchError, setFetchError] = useState(null)
  const [needsLogin, setNeedsLogin] = useState(false)

  const loadedForRef = useRef(null)
  const fetchGenRef = useRef(0)
  const prevTripIdRef = useRef(tripId)
  const generatedRef = useRef(generated)
  generatedRef.current = generated

  useEffect(() => {
    if (prevTripIdRef.current !== tripId) {
      prevTripIdRef.current = tripId
      loadedForRef.current = null
      if (tripId) {
        setGenerated(null)
        setFetchError(null)
        setNeedsLogin(false)
      }
    }

    if (!tripId) {
      loadedForRef.current = null
      setTripMeta(navMeta)

      if (isValidItinerary(navState?.itinerary)) {
        setGenerated(navState.itinerary)
        setFetchError(null)
        setNeedsLogin(false)
        return undefined
      }

      let cancelled = false
      setFetchError(null)

      ;(async () => {
        try {
          const data = await generateItinerary(navMeta)
          if (!cancelled && isValidItinerary(data)) {
            setGenerated(data)
          } else if (!cancelled) {
            setGenerated(null)
            setFetchError('Could not generate itinerary for this trip.')
          }
        } catch (err) {
          if (!cancelled) {
            setGenerated(null)
            setFetchError(err.message || 'Could not load itinerary')
          }
        }
      })()

      return () => {
        cancelled = true
      }
    }

    if (!sessionReady) {
      return undefined
    }

    const authToken = token || getAuthToken()
    if (!authToken) {
      setGenerated(null)
      setNeedsLogin(true)
      setFetchError(null)
      return undefined
    }

    const loadKey = `${authToken}:${tripId}`
    if (loadedForRef.current === loadKey && isValidItinerary(generatedRef.current)) {
      return undefined
    }

    if (loadedForRef.current && loadedForRef.current !== loadKey) {
      setGenerated(null)
    }

    const fetchGen = ++fetchGenRef.current
    let cancelled = false
    setNeedsLogin(false)
    setFetchError(null)

    ;(async () => {
      try {
        const { res, trip } = await fetchTrip(tripId, authToken)

        if (cancelled || fetchGen !== fetchGenRef.current) return

        if (res.status === 401) {
          if (!isValidItinerary(generatedRef.current)) {
            setGenerated(null)
            setNeedsLogin(true)
          }
          return
        }

        if (res.status === 404) {
          if (!isValidItinerary(generatedRef.current)) {
            setGenerated(null)
            setFetchError('This trip was not found. It may have been deleted or saved under another account.')
          }
          return
        }

        if (!res.ok) {
          throw new Error(trip.error || 'Could not load trip')
        }

        const savedPlan = planFromSavedTrip(trip)
        setTripMeta((prev) => ({ ...prev, ...navMeta, ...savedPlan }))

        if (isValidItinerary(trip.itinerary)) {
          setGenerated(trip.itinerary)
          loadedForRef.current = loadKey
          return
        }

        const mergedPlan = { ...navMeta, ...savedPlan, tripId }
        const data = await generateItinerary(mergedPlan, trip)
        if (cancelled || fetchGen !== fetchGenRef.current) return

        if (isValidItinerary(data)) {
          setGenerated(data)
          loadedForRef.current = loadKey
          await updateTripItinerary(tripId, data, authToken).catch(() => {})
          return
        }

        if (!isValidItinerary(generatedRef.current)) {
          setGenerated(null)
          setFetchError('Could not build an itinerary for this trip.')
        }
      } catch (err) {
        if (!cancelled && fetchGen === fetchGenRef.current && !isValidItinerary(generatedRef.current)) {
          setGenerated(null)
          setFetchError(err.message || 'Could not load itinerary')
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, sessionReady, token])

  const planMeta = useMemo(
    () => ({
      tripId,
      ...tripMeta,
    }),
    [tripId, tripMeta],
  )

  const itinerary = useMemo(() => {
    if (!isValidItinerary(generated)) return null
    return mergePlanMeta({ ...generated }, planMeta)
  }, [generated, planMeta])

  const hasItinerary = isValidItinerary(generated)

  // Save an unsaved (e.g. AI-concierge) itinerary into the user's trips.
  async function handleSaveTrip({ redirectToTrip = false } = {}) {
    if (!isValidItinerary(generated) || saving) return false
    const authToken = token || getAuthToken()
    if (!authToken) {
      navigate('/login', { state: { from: location } })
      return false
    }
    const dest =
      generated.destination || planMeta.destination || (planMeta.destinations || [])[0] || 'Malaysia'
    setSaving(true)
    setSaveError('')
    try {
      const { res, trip } = await saveTrip(
        {
          location: `${dest}, Malaysia`,
          title: planMeta.title || `${generated.dayCount || generated.days?.length || 1} Days in ${dest}`,
          description: '',
          image: generated.coverImage || null,
          startDate: planMeta.startDate || null,
          endDate: planMeta.endDate || null,
          itinerary: generated,
          destinations: generated.destinations || planMeta.destinations || [dest],
          vibes: planMeta.vibes || [],
          pace: planMeta.pace || 'balanced',
          budget: planMeta.budget || 'mid',
        },
        authToken,
      )
      if (res.status === 401) {
        setSaveError(t('Your session expired. Please sign in again to save.'))
        return false
      }
      if (!res.ok) throw new Error(trip.error || 'Could not save trip')
      setJustSaved(true)
      setToast(t('Saved to My Trips'))
      window.setTimeout(() => setToast(''), 3500)
      if (redirectToTrip && trip?.id) {
        navigate(`/itinerary/trip/${encodeURIComponent(trip.id)}`, { replace: true })
      }
      return true
    } catch (err) {
      setSaveError(err.message || 'Could not save trip. Try again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (
      tripId ||
      !navState?.autoSave ||
      !hasItinerary ||
      justSaved ||
      saving ||
      autoSaveAttemptedRef.current
    ) {
      return
    }
    const authToken = token || getAuthToken()
    if (!authToken) return

    autoSaveAttemptedRef.current = true
    handleSaveTrip({ redirectToTrip: true }).then((ok) => {
      if (!ok) autoSaveAttemptedRef.current = false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, navState?.autoSave, hasItinerary, justSaved, saving, token])

  const showConciergeSaveHint = Boolean(navState?.fromConcierge && !tripId && !justSaved && !navState?.autoSave)

  const showLoading =
    !hasItinerary &&
    (tripId ? !sessionReady || Boolean(token || getAuthToken()) : true)

  if (showLoading) {
    return (
      <div className="home-v2 itin-v2 itin-loading-screen min-h-screen">
        <HomeTopNav activePage="trips" />
        <TravelahLoader />
      </div>
    )
  }

  if (needsLogin && !hasItinerary) {
    return (
      <div className="home-v2 itin-v2 min-h-screen">
        <HomeTopNav activePage="trips" />
        <div className="page-wrap" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <p>{t('Sign in to view this saved trip.')}</p>
          <Link
            to="/login"
            state={{ from: location }}
            className="itin-action primary"
            style={{ display: 'inline-flex', marginTop: 16 }}
          >
            {t('Sign in')}
          </Link>
          <Link to="/trips" className="itin-action" style={{ display: 'inline-flex', marginTop: 12, marginLeft: 8 }}>
            {t('Back to My Trips')}
          </Link>
        </div>
      </div>
    )
  }

  if (!hasItinerary) {
    return (
      <div className="home-v2 itin-v2 min-h-screen">
        <HomeTopNav activePage="trips" />
        <div className="page-wrap" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <p>{fetchError || t('No itinerary found for this trip.')}</p>
          <Link to="/plan" className="itin-action primary" style={{ display: 'inline-flex', marginTop: 16 }}>
            {t('Plan a new trip')}
          </Link>
          <Link to="/trips" className="itin-action" style={{ display: 'inline-flex', marginTop: 12, marginLeft: 8 }}>
            {t('Back to My Trips')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="home-v2 itin-v2 min-h-screen">
      <HomeTopNav activePage="trips" />
      {showConciergeSaveHint && (
        <div className="itin-concierge-banner" role="status">
          <span className="material-symbols-outlined">info</span>
          <p>{t('This itinerary is not saved yet. Sign in and tap Save to My Trips to keep it.')}</p>
        </div>
      )}
      <ItineraryView
        itinerary={itinerary}
        variant="full"
        tripId={tripId}
        planMeta={planMeta}
        onSaveTrip={!tripId && !justSaved ? () => handleSaveTrip() : undefined}
        saving={saving}
        saveError={saveError}
        onGenerateItinerary={(plan) => generateItinerary(plan)}
        onTripUpdated={({ trip, itinerary: nextItinerary, planMeta: nextPlanMeta }) => {
          setGenerated(nextItinerary)
          setTripMeta((prev) => ({
            ...prev,
            ...nextPlanMeta,
            ...planFromSavedTrip(trip),
          }))
        }}
        onItineraryChange={(updated) => {
          setGenerated((prev) => (prev ? { ...prev, days: updated.days, stay: updated.stay } : prev))
        }}
      />

      {toast && (
        <div className="itin-toast" role="status">
          <span className="material-symbols-outlined">check_circle</span>
          {toast}
          <Link to="/trips" className="itin-toast-link">
            {t('View')}
          </Link>
        </div>
      )}
    </div>
  )
}
