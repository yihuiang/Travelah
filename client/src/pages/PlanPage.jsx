import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import HomeTopNav from '../components/home/HomeTopNav.jsx'
import ItineraryView from '../components/itinerary/ItineraryView.jsx'
import SocialAuthButtons from '../components/SocialAuthButtons.jsx'
import ThemedDatePicker from '../components/ThemedDatePicker.jsx'
import { useAuth, getAuthToken } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { translateTemplate } from '../i18n/template.js'
import { getSuggestionsFromPreferences, isIdentityComplete, needsOnboarding } from '../utils/preferenceSuggestions.js'
import { mergePlanMeta } from '../utils/itineraryMeta.js'
import { saveTrip } from '../utils/tripsApi.js'
import '../styles/home-v2.css'
import '../styles/plan-v2.css'
import '../styles/itinerary-v2.css'
import '../styles/auth-v2.css'

const STEPS = [
  { id: 1, label: 'Where' },
  { id: 2, label: 'When' },
  { id: 3, label: 'Vibe' },
  { id: 4, label: 'Style' },
  { id: 5, label: 'Review' },
  { id: 6, label: 'Preview' },
]

const RECOMMENDED_DESTINATIONS = [
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

const VIBE_OPTIONS = [
  { id: 'culture', label: 'Culture & Heritage', sub: 'Temples, street art, history', icon: 'museum' },
  { id: 'food', label: 'Food First', sub: 'Hawker stalls, local eats', icon: 'restaurant' },
  { id: 'nature', label: 'Nature & Hiking', sub: 'Trails, parks, waterfalls', icon: 'forest' },
  { id: 'adventure', label: 'Adventure', sub: 'Diving, climbing, rafting', icon: 'surfing' },
  { id: 'relax', label: 'Relax & Unwind', sub: 'Slow days, beaches, wellness', icon: 'spa' },
  { id: 'shopping', label: 'Markets & Shopping', sub: 'Night markets, local crafts', icon: 'storefront' },
]

const PACE_OPTIONS = [
  { id: 'relaxed', label: 'Relaxed', sub: '3 stops/day', icon: 'coffee' },
  { id: 'balanced', label: 'Balanced', sub: '4–5 stops/day', icon: 'directions_walk' },
  { id: 'full', label: 'Full-on', sub: '6+ stops/day', icon: 'sprint' },
]

const BUDGET_OPTIONS = [
  { id: 'shoestring', label: 'Shoestring', sub: 'Under RM150/day', icon: 'savings' },
  { id: 'mid', label: 'Mid-range', sub: 'RM150–400/day', icon: 'account_balance_wallet' },
  { id: 'splurge', label: 'Splurge', sub: 'RM400+/day', icon: 'diamond' },
]

const LEGACY_VIBE_MAP = {
  foodie: 'food',
  history: 'culture',
  nature: 'nature',
  shopping: 'shopping',
  museum: 'culture',
  popular: 'adventure',
}

function formatDate(d) {
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

function activeDestinationPart(input) {
  const parts = String(input || '')
    .split(/[,;]+|\s+then\s+|\s+&\s+|\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
  return parts[parts.length - 1] || ''
}

function parseDestinationParts(input) {
  return String(input || '')
    .split(/[,;]+|\s+then\s+|\s+&\s+|\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

function allocateDaysPerSegment(segmentCount, totalDays) {
  if (segmentCount <= 0 || totalDays <= 0) return []
  if (segmentCount > totalDays) return []

  const days = Array(segmentCount).fill(1)
  let remaining = totalDays - segmentCount
  let index = 0
  while (remaining > 0) {
    days[index % segmentCount] += 1
    remaining -= 1
    index += 1
  }
  return days
}

function destinationRouteKey(destinations) {
  return destinations.join('\u0001')
}

function StepHeadline({ line1Key, line2Key }) {
  const { t } = useLanguage()
  return (
    <h1 className="step-headline">
      {t(line1Key)}
      <br />
      <em>{t(line2Key)}</em>
    </h1>
  )
}

export default function PlanPage() {
  const { user, isAuthenticated, login, loginWithGoogle, token, syncUserSession, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()

  const [currentStep, setCurrentStep] = useState(1)
  const [destination, setDestination] = useState('')
  const [selectedDestinations, setSelectedDestinations] = useState([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [vibes, setVibes] = useState({})
  const [pace, setPace] = useState(null)
  const [budget, setBudget] = useState(null)
  const [extraNotes, setExtraNotes] = useState('')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [appliedSuggestions, setAppliedSuggestions] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [notesAppliedHint, setNotesAppliedHint] = useState('')
  const [generatedItinerary, setGeneratedItinerary] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [pendingSave, setPendingSave] = useState(false)
  const [draggingRouteIndex, setDraggingRouteIndex] = useState(null)
  const [dragOverRouteIndex, setDragOverRouteIndex] = useState(null)
  const [destValidation, setDestValidation] = useState(null)
  const [destSuggestions, setDestSuggestions] = useState([])
  const [destInputError, setDestInputError] = useState('')
  const [validatingDestination, setValidatingDestination] = useState(false)
  const [destinationChips, setDestinationChips] = useState(RECOMMENDED_DESTINATIONS)

  const [segmentDays, setSegmentDays] = useState([])
  const [segmentDaysError, setSegmentDaysError] = useState('')
  const [stepNotice, setStepNotice] = useState('')
  const planSeedApplied = useRef(false)

  const today = useMemo(() => new Date().toISOString().split('T')[0], [])

  useEffect(() => {
    const seed = location.state?.planSeed
    if (!seed || planSeedApplied.current) return
    planSeedApplied.current = true
    if (seed.destination) {
      setDestination((prev) => prev || seed.destination)
    }
  }, [location.state])

  useEffect(() => {
    let cancelled = false
    fetch('/api/locations?recommended=true')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const chips = data.locations || []
        setDestinationChips(chips.length > 0 ? chips : RECOMMENDED_DESTINATIONS)
      })
      .catch(() => {
        if (!cancelled) setDestinationChips(RECOMMENDED_DESTINATIONS)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const travelSuggestions = useMemo(
    () => getSuggestionsFromPreferences(user?.preferences),
    [user?.preferences],
  )

  useEffect(() => {
    if (!isAuthenticated || !isIdentityComplete(user?.preferences) || appliedSuggestions) return
    const suggested = travelSuggestions.suggestedVibes
    if (Object.keys(suggested).length === 0) return

    const mapped = {}
    for (const [key, value] of Object.entries(suggested)) {
      if (value && LEGACY_VIBE_MAP[key]) mapped[LEGACY_VIBE_MAP[key]] = true
    }
    if (Object.keys(mapped).length > 0) {
      setVibes((prev) => ({ ...prev, ...mapped }))
      setAppliedSuggestions(true)
    }
  }, [isAuthenticated, user?.preferences, travelSuggestions.suggestedVibes, appliedSuggestions])

  useEffect(() => {
    const part = activeDestinationPart(destination) || destination.trim()
    if (!part || part.length < 2) {
      setDestValidation(null)
      setDestSuggestions([])
      return undefined
    }

    const timer = window.setTimeout(async () => {
      setValidatingDestination(true)
      try {
        const query = encodeURIComponent(destination)
        const [validateRes, suggestRes] = await Promise.all([
          fetch(`/api/destinations/validate?q=${query}`),
          fetch(`/api/destinations/suggest?q=${query}&limit=6`),
        ])
        const validation = await validateRes.json().catch(() => ({}))
        const suggestData = await suggestRes.json().catch(() => ({}))
        setDestValidation(validation)
        setDestSuggestions(suggestData.suggestions || [])
        if (validation.valid) setDestInputError('')
      } catch {
        setDestValidation(null)
        setDestSuggestions([])
      } finally {
        setValidatingDestination(false)
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [destination])

  const dateSummary = useMemo(() => {
    if (!startDate || !endDate) return null
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (end <= start) return null
    const nights = Math.round((end - start) / 86400000)
    const days = nights + 1
    return {
      text: `${formatDate(start)} → ${formatDate(end)}`,
      nights,
      days,
    }
  }, [startDate, endDate])

  const tripDayCount = dateSummary?.days || 0
  const multiStopTrip = selectedDestinations.length > 1

  useEffect(() => {
    if (!multiStopTrip || tripDayCount < selectedDestinations.length) {
      setSegmentDays([])
      setSegmentDaysError('')
      return
    }

    setSegmentDays((prev) => {
      const auto = allocateDaysPerSegment(selectedDestinations.length, tripDayCount)
      if (prev.length !== selectedDestinations.length) return auto
      const sum = prev.reduce((total, value) => total + value, 0)
      if (sum !== tripDayCount || prev.some((value) => value < 1)) return auto
      return prev
    })
  }, [multiStopTrip, tripDayCount, destinationRouteKey(selectedDestinations)])

  const segmentDaysTotal = segmentDays.reduce((sum, value) => sum + value, 0)
  const segmentDaysBalanced = !multiStopTrip || segmentDaysTotal === tripDayCount

  const routeDestinations = useMemo(() => {
    const fromInput = destination
      .split(/[,;]+|\s+then\s+|\s+&\s+|\s+and\s+/i)
      .map((item) => item.trim())
      .filter(Boolean)
    const combined = [...selectedDestinations]
    for (const item of fromInput) {
      if (!combined.some((dest) => dest.toLowerCase() === item.toLowerCase())) {
        combined.push(item)
      }
    }
    return combined
  }, [selectedDestinations, destination])

  const routeLabel = useMemo(() => {
    if (routeDestinations.length === 0) return '—'
    return routeDestinations.join(' → ')
  }, [routeDestinations])

  const review = useMemo(() => {
    const dest = routeLabel
    let datesStr = '—'
    if (dateSummary) {
      datesStr = `${dateSummary.text.replace(' → ', ' – ')} (${dateSummary.nights} ${dateSummary.nights === 1 ? t('night') : t('nights')})`
    }
    const vibeLabels = VIBE_OPTIONS.filter((v) => vibes[v.id]).map((v) => v.label)
    const paceLabel = PACE_OPTIONS.find((p) => p.id === pace)?.label || '—'
    const budgetLabel = BUDGET_OPTIONS.find((b) => b.id === budget)?.label || '—'
    const segmentPlanLabel =
      multiStopTrip && segmentDays.length === selectedDestinations.length
        ? selectedDestinations
            .map((name, index) => `${name} (${segmentDays[index]}d)`)
            .join(' → ')
        : null
    return { dest, datesStr, vibeLabels, paceLabel, budgetLabel, segmentPlanLabel }
  }, [routeLabel, dateSummary, vibes, pace, budget, multiStopTrip, segmentDays, selectedDestinations, t])

  const goToStep = (n) => {
    if (n === 6 && !generatedItinerary) return
    if (n >= 1 && n <= 4 && generatedItinerary) {
      setGeneratedItinerary(null)
    }
    setCurrentStep(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const prevStep = (from) => {
    if (from > 1) goToStep(from - 1)
  }

  const toggleDestination = (name) => {
    setSelectedDestinations((prev) => {
      if (prev.includes(name)) return prev.filter((item) => item !== name)
      if (prev.length >= 4) return prev
      return [...prev, name]
    })
    setDestination('')
    setDestInputError('')
    setDestValidation(null)
    setDestSuggestions([])
    setStepNotice('')
  }

  const removeDestination = (name) => {
    setSelectedDestinations((prev) => {
      const index = prev.indexOf(name)
      if (index === -1) return prev
      setSegmentDays((days) => days.filter((_, dayIndex) => dayIndex !== index))
      return prev.filter((item) => item !== name)
    })
  }

  const adjustSegmentDay = (index, delta) => {
    if (!tripDayCount) return
    setSegmentDays((prev) => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const proposed = next[index] + delta
      if (proposed < 1) return prev

      const otherSum = next.reduce((sum, value, i) => (i === index ? sum : sum + value), 0)
      if (proposed + otherSum > tripDayCount) {
        let need = proposed + otherSum - tripDayCount
        const donors = next
          .map((value, i) => ({ i, value }))
          .filter((item) => item.i !== index && item.value > 1)
          .sort((a, b) => b.value - a.value)
        for (const donor of donors) {
          if (need <= 0) break
          const take = Math.min(need, next[donor.i] - 1)
          next[donor.i] -= take
          need -= take
        }
        if (need > 0) return prev
      } else if (proposed + otherSum < tripDayCount) {
        let spare = tripDayCount - (proposed + otherSum)
        next[index] = proposed
        for (let i = 0; i < next.length && spare > 0; i += 1) {
          if (i === index) continue
          next[i] += 1
          spare -= 1
        }
        return next
      }

      next[index] = proposed
      return next
    })
    setSegmentDaysError('')
  }

  const reorderDestinations = (fromIndex, toIndex) => {
    if (fromIndex === null || toIndex === null || fromIndex === toIndex) return
    setSelectedDestinations((prev) => {
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

  const moveDestination = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= selectedDestinations.length) return
    reorderDestinations(index, target)
  }

  const handleRouteDragStart = (event, index) => {
    setDraggingRouteIndex(index)
    setDragOverRouteIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  const handleRouteDragOver = (event, index) => {
    event.preventDefault()
    if (draggingRouteIndex === null || draggingRouteIndex === index) return
    setDragOverRouteIndex(index)
  }

  const handleRouteDrop = (event, index) => {
    event.preventDefault()
    if (draggingRouteIndex === null) return
    reorderDestinations(draggingRouteIndex, index)
    setDraggingRouteIndex(null)
    setDragOverRouteIndex(null)
  }

  const handleRouteDragEnd = () => {
    setDraggingRouteIndex(null)
    setDragOverRouteIndex(null)
  }

  const handleDestInput = (value) => {
    setDestination(value)
    setDestInputError('')
  }

  const validateDestinationPart = async (part) => {
    const res = await fetch(`/api/destinations/validate?q=${encodeURIComponent(part)}`)
    const data = await res.json().catch(() => ({}))
    return data
  }

  const addValidatedLabel = (label) => {
    if (!label) return false
    if (selectedDestinations.length >= 4) {
      setDestInputError('You can add up to 4 stops.')
      return false
    }
    if (selectedDestinations.some((item) => item.toLowerCase() === label.toLowerCase())) {
      return true
    }
    setSelectedDestinations((prev) => [...prev, label])
    return true
  }

  const applySuggestion = async (label) => {
    setDestInputError('')
    const added = addValidatedLabel(label)
    if (added) {
      setDestination('')
      setDestValidation(null)
      setDestSuggestions([])
    }
  }

  const addDestinationFromInput = async () => {
    const parts = parseDestinationParts(destination)
    if (parts.length === 0) {
      return { ok: false, count: selectedDestinations.length, destinations: selectedDestinations }
    }

    setDestInputError('')
    const labels = []

    for (const part of parts) {
      const result = await validateDestinationPart(part)
      if (!result.valid) {
        setDestInputError(result.message || `"${part}" is not a recognized location.`)
        setDestValidation(result)
        return { ok: false, count: selectedDestinations.length, destinations: selectedDestinations }
      }
      labels.push(result.canonicalLabel || result.label)
    }

    const next = [...selectedDestinations]
    for (const label of labels) {
      if (next.length >= 4) {
        setDestInputError('You can add up to 4 stops.')
        break
      }
      if (!next.some((item) => item.toLowerCase() === label.toLowerCase())) {
        next.push(label)
      }
    }

    setSelectedDestinations(next)
    setDestination('')
    setDestValidation(null)
    setDestSuggestions([])
    return { ok: true, count: next.length, destinations: next }
  }

  const handleDestKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      await addDestinationFromInput()
    }
  }

  const handleDestBlur = async () => {
    if (!destination.trim()) return
    const part = activeDestinationPart(destination)
    if (!part) return
    if (destValidation?.valid) {
      await addDestinationFromInput()
    }
  }

  const pendingDestinationInvalid = useMemo(() => {
    const part = activeDestinationPart(destination)
    if (!part) return false
    if (validatingDestination) return true
    return Boolean(destValidation && !destValidation.valid)
  }, [destination, destValidation, validatingDestination])

  const canLeaveStepOne = selectedDestinations.length > 0 && !pendingDestinationInvalid

  useEffect(() => {
    if (!stepNotice) return undefined
    const timer = window.setTimeout(() => setStepNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [stepNotice])

  const hasVibes = useMemo(() => VIBE_OPTIONS.some((v) => vibes[v.id]), [vibes])

  const canCompleteStepTwo = useMemo(() => {
    if (!dateSummary) return false
    if (multiStopTrip) {
      if (tripDayCount < selectedDestinations.length) return false
      if (!segmentDaysBalanced) return false
    }
    return true
  }, [dateSummary, multiStopTrip, tripDayCount, selectedDestinations.length, segmentDaysBalanced])

  const canCompleteStepThree = hasVibes
  const canCompleteStepFour = Boolean(pace && budget)

  const isStepTabLocked = (stepId) => {
    if (stepId === 6) return !generatedItinerary
    if (stepId === 2) return !canLeaveStepOne
    if (stepId === 3) return !canLeaveStepOne || !canCompleteStepTwo
    if (stepId === 4) return !canLeaveStepOne || !canCompleteStepTwo || !canCompleteStepThree
    if (stepId === 5) return !canLeaveStepOne || !canCompleteStepTwo || !canCompleteStepThree || !canCompleteStepFour
    return false
  }

  const showStepNotice = (message, returnToStep) => {
    setStepNotice(message)
    if (returnToStep) {
      setCurrentStep(returnToStep)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const ensureStepOneComplete = async () => {
    let routeCount = selectedDestinations.length
    if (destination.trim()) {
      const result = await addDestinationFromInput()
      if (!result.ok) {
        showStepNotice('Add a valid Malaysian destination before continuing.', 1)
        return false
      }
      routeCount = result.count
    }
    if (routeCount === 0) {
      setDestInputError('Add at least one valid Malaysian destination.')
      showStepNotice('Pick at least one destination to continue.', 1)
      return false
    }
    if (pendingDestinationInvalid) {
      showStepNotice('Fix or clear the destination in the search field before continuing.', 1)
      return false
    }
    return true
  }

  const ensureStepTwoComplete = () => {
    if (!startDate || !endDate) {
      showStepNotice('Set your check-in and check-out dates before continuing.', 2)
      return false
    }
    if (!dateSummary) {
      showStepNotice('Check-out must be after check-in.', 2)
      return false
    }
    if (multiStopTrip) {
      if (tripDayCount < selectedDestinations.length) {
        const msg = `Add at least ${selectedDestinations.length} days for your ${selectedDestinations.length} stops.`
        setSegmentDaysError(msg)
        showStepNotice(msg, 2)
        return false
      }
      if (!segmentDaysBalanced) {
        const msg = 'Allocate all days across your stops before continuing.'
        setSegmentDaysError(msg)
        showStepNotice(msg, 2)
        return false
      }
    }
    setSegmentDaysError('')
    return true
  }

  const ensureStepThreeComplete = () => {
    if (!hasVibes) {
      showStepNotice('Pick at least one vibe before continuing.', 3)
      return false
    }
    return true
  }

  const ensureStepFourComplete = () => {
    if (!pace) {
      showStepNotice('Choose a travel pace before continuing.', 4)
      return false
    }
    if (!budget) {
      showStepNotice('Choose a budget before continuing.', 4)
      return false
    }
    return true
  }

  const ensureStepsCompleteThrough = async (throughStep) => {
    if (throughStep >= 1 && !(await ensureStepOneComplete())) return false
    if (throughStep >= 2 && !ensureStepTwoComplete()) return false
    if (throughStep >= 3 && !ensureStepThreeComplete()) return false
    if (throughStep >= 4 && !ensureStepFourComplete()) return false
    setStepNotice('')
    return true
  }

  const handleStepTabClick = async (stepId) => {
    if (stepId === 1) {
      goToStep(1)
      return
    }
    if (stepId === 6) {
      if (generatedItinerary) {
        goToStep(6)
        return
      }
      if (!(await ensureStepsCompleteThrough(4))) return
      showStepNotice('Generate your itinerary from Review before opening Preview.', 5)
      return
    }
    if (!(await ensureStepsCompleteThrough(stepId - 1))) return
    goToStep(stepId)
  }

  const nextStep = async (from) => {
    if (from === 1) {
      if (!(await ensureStepOneComplete())) return
      setStepNotice('')
      goToStep(2)
      return
    }
    if (from === 2) {
      if (!ensureStepTwoComplete()) return
      setStepNotice('')
      goToStep(3)
      return
    }
    if (from === 3) {
      if (!ensureStepThreeComplete()) return
      setStepNotice('')
      goToStep(4)
      return
    }
    if (from === 4) {
      if (!ensureStepFourComplete()) return
      setStepNotice('')
      goToStep(5)
    }
  }

  const toggleVibe = (id) => {
    setVibes((prev) => ({ ...prev, [id]: !prev[id] }))
    setStepNotice('')
  }

  const planMeta = useMemo(() => {
    const vibeIds = VIBE_OPTIONS.filter((v) => vibes[v.id]).map((v) => v.id)
    const vibeLabels = VIBE_OPTIONS.filter((v) => vibes[v.id])
      .map((v) => v.label)
      .join(', ')
    const paceLabel = PACE_OPTIONS.find((p) => p.id === pace)?.label || '—'
    const budgetLabel = BUDGET_OPTIONS.find((b) => b.id === budget)?.label || '—'
    const destinations = routeDestinations.length > 0 ? routeDestinations : ['Penang']
    const dest = destinations.join(' → ')
    const description = [vibeLabels || null, paceLabel, budgetLabel].filter(Boolean).join(' · ')
    return { vibeIds, vibeLabels, paceLabel, budgetLabel, dest, destinations, description }
  }, [routeDestinations, vibes, pace, budget])

  const launchItinerary = async () => {
    let destinations = selectedDestinations
    if (destination.trim()) {
      const result = await addDestinationFromInput()
      if (!result.ok) return
      destinations = result.destinations || selectedDestinations
    }
    if (destinations.length === 0) destinations = ['Penang']
    const { vibeIds } = planMeta
    const dest = destinations.join(' → ')

    setGenerateError('')
    setNotesAppliedHint('')
    setSaving(false)
    setSaveError('')
    setGenerating(true)

    try {
      const res = await fetch('/api/itinerary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinations,
          startDate: startDate || null,
          endDate: endDate || null,
          vibes: vibeIds,
          pace: pace || 'balanced',
          budget: budget || 'mid',
          extraNotes: extraNotes.trim() || null,
          daysPerDestination:
            destinations.length > 1 && segmentDays.length === destinations.length
              ? segmentDays
              : null,
        }),
      })
      const itinerary = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(itinerary.error || 'Could not generate itinerary')
      }
      if (itinerary.empty) {
        throw new Error(itinerary.message || `No places found for ${dest}`)
      }

      setGeneratedItinerary(itinerary)
      const coverageHint = Array.isArray(itinerary.coverageNotes)
        ? itinerary.coverageNotes.filter(Boolean).join(' ')
        : ''
      if (coverageHint) {
        setNotesAppliedHint(coverageHint)
      } else if (extraNotes.trim()) {
        if (itinerary.notesRateLimited) {
          setNotesAppliedHint(t('We applied your note using basic matching (AI limit reached).'))
        } else {
          setNotesAppliedHint(t('We applied your note when picking places.'))
        }
      }
      goToStep(6)
    } catch (err) {
      setGenerateError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const saveTripWithToken = async (authToken) => {
    if (!generatedItinerary) return
    if (!authToken) {
      setSaveError('Sign in to save this trip.')
      return
    }

    const { dest, description, vibeLabels, paceLabel, budgetLabel, destinations, vibeIds } = planMeta
    setSaveError('')
    setSaving(true)

    try {
      const { res, trip } = await saveTrip(
        {
          location: `${generatedItinerary.destination || dest}, Malaysia`,
          title: `${generatedItinerary.dayCount || generatedItinerary.days?.length || 1} Days in ${generatedItinerary.destination || dest}`,
          description,
          image: generatedItinerary.coverImage || null,
          startDate: startDate || null,
          endDate: endDate || null,
          itinerary: generatedItinerary,
          destinations: generatedItinerary.destinations || destinations,
          vibes: vibeIds,
          pace: pace || 'balanced',
          budget: budget || 'mid',
          daysPerDestination:
            (generatedItinerary.destinations || destinations).length > 1 &&
            segmentDays.length === (generatedItinerary.destinations || destinations).length
              ? segmentDays
              : generatedItinerary.segmentPlan?.map((segment) => segment.days) || null,
          vibeLabels: vibeLabels || null,
          paceLabel,
          budgetLabel,
          extraNotes: extraNotes.trim() || null,
        },
        authToken,
      )
      if (res.status === 401) {
        logout()
        setPendingSave(true)
        setShowLoginModal(true)
        setSaveError('Your session expired. Please sign in again to save this trip.')
        return
      }
      if (!res.ok) {
        throw new Error(trip.error || 'Could not save trip')
      }

      const profileRes = await fetch('/api/profile/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const profile = await profileRes.json().catch(() => ({}))
      if (profileRes.ok) {
        syncUserSession(profile)
      }

      navigate('/trips', {
        state: {
          saved: true,
          profile: profileRes.ok ? profile : null,
          itinerary: generatedItinerary,
          destination: generatedItinerary.destination || dest,
          startDate,
          endDate,
          vibeLabels: vibeLabels || '—',
          paceLabel,
          budgetLabel,
          extraNotes,
          vibes: vibeIds,
          pace: pace || 'balanced',
          budget: budget || 'mid',
        },
      })
    } catch (err) {
      setSaveError(err.message || 'Could not save trip. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTrip = async () => {
    if (!generatedItinerary) return
    const authToken = token || getAuthToken()
    if (!isAuthenticated || !authToken) {
      setPendingSave(true)
      setShowLoginModal(true)
      setSaveError('')
      return
    }
    await saveTripWithToken(authToken)
  }

  const handleGenerate = async () => {
    if (generating) return
    if (!(await ensureStepsCompleteThrough(4))) return
    launchItinerary()
  }

  const closeModal = () => {
    if (loginSubmitting) return
    setShowLoginModal(false)
    setLoginError('')
    setPendingSave(false)
  }

  const finishModalAuth = async () => {
    setShowLoginModal(false)
    setLoginEmail('')
    setLoginPassword('')
    if (pendingSave) {
      setPendingSave(false)
      const authToken = getAuthToken()
      if (!authToken) {
        setSaveError('Sign in to save this trip.')
        return
      }
      await saveTripWithToken(authToken)
    }
  }

  const handleModalLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    setLoginSubmitting(true)
    try {
      const signedInUser = await login(loginEmail.trim(), loginPassword)
      if (needsOnboarding(signedInUser)) {
        setShowLoginModal(false)
        navigate('/register', {
          state: { background: location, from: { pathname: '/plan' }, onboarding: true },
        })
        return
      }
      await finishModalAuth()
    } catch (err) {
      setLoginError(err.message || 'Sign in failed. Check your email and password.')
    } finally {
      setLoginSubmitting(false)
    }
  }

  const handleModalGoogleSuccess = async (credential) => {
    setLoginError('')
    setLoginSubmitting(true)
    try {
      const { user: signedInUser } = await loginWithGoogle(credential, true)
      if (needsOnboarding(signedInUser)) {
        setShowLoginModal(false)
        navigate('/register', {
          state: { background: location, from: { pathname: '/plan' }, onboarding: true },
        })
        return
      }
      await finishModalAuth()
    } catch (err) {
      if (err.code === 'ACCOUNT_NOT_FOUND' && err.googleEmail) {
        setShowLoginModal(false)
        navigate('/register', {
          state: {
            background: location,
            from: { pathname: '/plan' },
            googleSignup: {
              email: err.googleEmail,
              displayName: err.googleDisplayName || '',
            },
          },
        })
        return
      }
      setLoginError(err.message || 'Google sign-in failed.')
    } finally {
      setLoginSubmitting(false)
    }
  }

  const previewItinerary = useMemo(() => {
    if (!generatedItinerary) return null
    const { vibeLabels, paceLabel, budgetLabel, dest } = planMeta
    return mergePlanMeta({ ...generatedItinerary }, {
      destination: generatedItinerary.destination || dest,
      startDate,
      endDate,
      vibeLabels: vibeLabels || '—',
      paceLabel,
      budgetLabel,
    })
  }, [generatedItinerary, planMeta, startDate, endDate])

  return (
    <div className="home-v2 plan-v2 min-h-screen flex flex-col">
      <HomeTopNav activePage="plan" />

      <div className="step-progress" role="tablist" aria-label="Plan steps">
        {STEPS.map((step) => {
          const isActive = currentStep === step.id
          const isDone = step.id < currentStep
          const isLocked = isStepTabLocked(step.id)
          return (
            <button
              key={step.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`step-tab${isActive ? ' active' : ''}${isDone ? ' done' : ''}${isLocked ? ' locked' : ''}`}
              onClick={() => handleStepTabClick(step.id)}
            >
              <span className="step-num">{step.id}</span>
              {t(step.label)}
            </button>
          )
        })}
      </div>

      <div className="step-progress-spacer" aria-hidden="true" />

      {stepNotice && (
        <div className="plan-step-notice" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">
            info
          </span>
          <p>{stepNotice}</p>
          <button type="button" className="plan-step-notice-close" onClick={() => setStepNotice('')} aria-label="Dismiss">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}

      {currentStep === 6 && previewItinerary ? (
        <div className="home-v2 itin-v2 plan-itin-preview">
          {notesAppliedHint && (
            <p className="plan-notes-applied" role="status">
              <span className="material-symbols-outlined" aria-hidden="true">auto_awesome</span>
              {notesAppliedHint}
            </p>
          )}
          <ItineraryView
            itinerary={previewItinerary}
            variant="preview"
            onSaveTrip={handleSaveTrip}
            onItineraryChange={(updated) => {
              setGeneratedItinerary((prev) =>
                prev ? { ...prev, days: updated.days, stay: updated.stay } : prev,
              )
            }}
            saving={saving}
            saveError={saveError}
            showFooter={false}
          />
        </div>
      ) : (
      <div className="plan-wrap">
        {/* Step 1 — Where */}
        <div className={`step-panel${currentStep === 1 ? ' active' : ''}`} id="step-1">
          <StepHeadline line1Key="planStep1HeadlineLine1" line2Key="planStep1HeadlineLine2" />
          <p className="step-sub">
            {t("Pick one or more stops in travel order — we'll split your days across each state.")}
          </p>
          {selectedDestinations.length > 0 && (
            <div className="route-strip">
              <span className="route-strip-label">{t('Your route — drag to reorder')}</span>
              <div className="route-strip-stops">
                {selectedDestinations.map((name, index) => (
                  <div
                    key={`${name}-${index}`}
                    className={`route-stop-wrap${draggingRouteIndex === index ? ' dragging' : ''}${dragOverRouteIndex === index && draggingRouteIndex !== index ? ' drag-over' : ''}`}
                    onDragOver={(event) => handleRouteDragOver(event, index)}
                    onDrop={(event) => handleRouteDrop(event, index)}
                  >
                    {index > 0 && <span className="route-arrow" aria-hidden="true">→</span>}
                    <span className="route-stop">
                      <span
                        className="route-drag-handle material-symbols-outlined"
                        draggable
                        onDragStart={(event) => handleRouteDragStart(event, index)}
                        onDragEnd={handleRouteDragEnd}
                        aria-hidden="true"
                        title="Drag to reorder"
                      >
                        drag_indicator
                      </span>
                      <span className="route-stop-name">{name}</span>
                      <span className="route-move-btns">
                        <button
                          type="button"
                          className="route-move-btn"
                          onClick={() => moveDestination(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${name} earlier`}
                        >
                          <span className="material-symbols-outlined">chevron_left</span>
                        </button>
                        <button
                          type="button"
                          className="route-move-btn"
                          onClick={() => moveDestination(index, 1)}
                          disabled={index === selectedDestinations.length - 1}
                          aria-label={`Move ${name} later`}
                        >
                          <span className="material-symbols-outlined">chevron_right</span>
                        </button>
                      </span>
                      <button
                        type="button"
                        className="route-stop-remove"
                        onClick={() => removeDestination(name)}
                        aria-label={`Remove ${name}`}
                      >
                        <span className="material-symbols-outlined">close</span>
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="dest-field-wrap">
            <div
              className={`field-wrap${destValidation?.valid && destValidation?.code !== 'thin' ? ' valid' : ''}${destValidation?.code === 'thin' ? ' thin' : ''}${pendingDestinationInvalid ? ' invalid' : ''}`}
            >
              <span className="material-symbols-outlined field-icon">search</span>
              <input
                className="field-input"
                type="text"
                value={destination}
                onChange={(e) => handleDestInput(e.target.value)}
                onKeyDown={handleDestKeyDown}
                onBlur={handleDestBlur}
                placeholder={t('Type a state or city — e.g. Penang, Melaka')}
                aria-invalid={pendingDestinationInvalid}
                aria-describedby="dest-validation-message"
              />
              {validatingDestination && (
                <span className="dest-field-status material-symbols-outlined spin" aria-hidden="true">
                  progress_activity
                </span>
              )}
              {!validatingDestination && destValidation?.valid && destValidation?.code !== 'thin' && (
                <span className="dest-field-status valid material-symbols-outlined" aria-hidden="true">
                  check_circle
                </span>
              )}
              {!validatingDestination && destValidation?.code === 'thin' && (
                <span className="dest-field-status thin material-symbols-outlined" aria-hidden="true">
                  info
                </span>
              )}
              {!validatingDestination && pendingDestinationInvalid && (
                <span className="dest-field-status invalid material-symbols-outlined" aria-hidden="true">
                  error
                </span>
              )}
            </div>

            {(destInputError || destValidation?.message) && (
              <p
                id="dest-validation-message"
                className={`dest-validation${
                  destValidation?.valid && destValidation?.code !== 'thin'
                    ? ' ok'
                    : destValidation?.code === 'thin'
                      ? ' warn'
                      : destInputError || pendingDestinationInvalid
                        ? ' err'
                        : ''
                }`}
              >
                {destInputError ||
                  (destValidation?.code === 'thin' && destValidation?.label && destValidation?.state
                    ? `${destValidation.label} — ${translateTemplate(t, "we'll plan with popular places in {{state}}", { state: destValidation.state })}`
                    : destValidation?.message)}
              </p>
            )}

            {destSuggestions.length > 0 && destination.trim() && (
              <div className="dest-suggest-list" role="listbox" aria-label="Suggested destinations">
                {destSuggestions.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="dest-suggest-item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestion(item.label)}
                  >
                    <span className="dest-suggest-name">{item.label}</span>
                    <span className="dest-suggest-meta">
                      {item.type === 'subdestination' && item.subType === 'city' && item.state
                        ? `${item.state} · `
                        : item.state && item.state !== item.label
                          ? `${item.state} · `
                          : ''}
                      {item.coverage === 'local'
                        ? `${item.placeCount} ${t('places')}`
                        : translateTemplate(t, 'General {{state}} itinerary', { state: item.state || item.label })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="prompt-hint">
            {t('We verify spelling and check our database for places in Malaysia. Select up to 4 stops.')}
          </p>
          <div className="chips">
            {destinationChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`chip${selectedDestinations.includes(chip.name) ? ' active' : ''}`}
                onClick={() => toggleDestination(chip.name)}
              >
                <span className="material-symbols-outlined">place</span>
                {chip.name}
              </button>
            ))}
          </div>
          <div className="step-nav">
            <button
              type="button"
              className="btn-next"
              onClick={() => nextStep(1)}
            >
              {t('Next — When?')} <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Step 2 — When */}
        <div className={`step-panel${currentStep === 2 ? ' active' : ''}`} id="step-2">
          <StepHeadline line1Key="planStep2HeadlineLine1" line2Key="planStep2HeadlineLine2" />
          <p className="step-sub">{t("Set your start and end dates — we'll calculate your trip length.")}</p>
          <div className="date-row">
            <ThemedDatePicker
              id="date-start"
              label={t('Check-in')}
              value={startDate}
              min={today}
              onChange={(next) => {
                setStartDate(next)
                if (endDate && next >= endDate) setEndDate('')
                setStepNotice('')
              }}
            />
            <ThemedDatePicker
              id="date-end"
              label={t('Check-out')}
              value={endDate}
              min={startDate || today}
              onChange={(next) => {
                setEndDate(next)
                setStepNotice('')
              }}
            />
          </div>
          {dateSummary && (
            <div className="date-summary">
              <span className="material-symbols-outlined">calendar_month</span>
              <span className="date-summary-text">{dateSummary.text}</span>
              <span className="date-summary-dur">
                {dateSummary.nights} {dateSummary.nights === 1 ? t('night') : t('nights')} · {tripDayCount}{' '}
                {tripDayCount === 1 ? t('day') : t('days')}
              </span>
            </div>
          )}

          {multiStopTrip && dateSummary && (
            <div className="segment-days-block">
              <div className="segment-days-head">
                <h2 className="segment-days-title">{t('Days per stop')}</h2>
                <p className="segment-days-sub">
                  {translateTemplate(t, 'Split {{days}}-day trip across {{count}} destinations.', {
                    days: tripDayCount,
                    count: selectedDestinations.length,
                  })}
                </p>
              </div>

              {tripDayCount < selectedDestinations.length ? (
                <p className="segment-days-warn">
                  {translateTemplate(
                    t,
                    'Add at least {{count}} days, or remove a stop (minimum 1 day per destination).',
                    { count: selectedDestinations.length },
                  )}
                </p>
              ) : (
                <>
                  <ul className="segment-days-list">
                    {selectedDestinations.map((name, index) => (
                      <li key={name} className="segment-days-row">
                        <span className="segment-days-name">{name}</span>
                        <div className="segment-days-controls">
                          <button
                            type="button"
                            className="segment-days-btn"
                            onClick={() => adjustSegmentDay(index, -1)}
                            disabled={segmentDays[index] <= 1}
                            aria-label={`Fewer days in ${name}`}
                          >
                            <span className="material-symbols-outlined">remove</span>
                          </button>
                          <span className="segment-days-count">
                            {segmentDays[index] ?? 1} {segmentDays[index] === 1 ? t('day') : t('days')}
                          </span>
                          <button
                            type="button"
                            className="segment-days-btn"
                            onClick={() => adjustSegmentDay(index, 1)}
                            aria-label={`More days in ${name}`}
                          >
                            <span className="material-symbols-outlined">add</span>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className={`segment-days-total${segmentDaysBalanced ? ' ok' : ' err'}`}>
                    {translateTemplate(t, '{{allocated}} of {{total}} days allocated', {
                      allocated: segmentDaysTotal,
                      total: tripDayCount,
                    })}
                  </p>
                </>
              )}

              {segmentDaysError && <p className="segment-days-error">{segmentDaysError}</p>}
            </div>
          )}

          <div className="step-nav">
            <button type="button" className="btn-back" onClick={() => prevStep(2)}>
              <span className="material-symbols-outlined">arrow_back</span> {t('Back')}
            </button>
            <button
              type="button"
              className="btn-next"
              onClick={() => nextStep(2)}
            >
              {t('Next — Vibe')} <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Step 3 — Vibe */}
        <div className={`step-panel${currentStep === 3 ? ' active' : ''}`} id="step-3">
          <StepHeadline line1Key="planStep3HeadlineLine1" line2Key="planStep3HeadlineLine2" />
          <p className="step-sub">{t("Pick everything that fits — we'll balance the mix.")}</p>
          <div className="option-grid-2">
            {VIBE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`option-card${vibes[option.id] ? ' active' : ''}`}
                onClick={() => toggleVibe(option.id)}
              >
                <span className="material-symbols-outlined">{option.icon}</span>
                <span className="option-label">{t(option.label)}</span>
                <span className="option-sub">{t(option.sub)}</span>
              </button>
            ))}
          </div>
          <div className="step-nav">
            <button type="button" className="btn-back" onClick={() => prevStep(3)}>
              <span className="material-symbols-outlined">arrow_back</span> {t('Back')}
            </button>
            <button type="button" className="btn-next" onClick={() => nextStep(3)}>
              {t('Next — Style')} <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Step 4 — Style */}
        <div className={`step-panel${currentStep === 4 ? ' active' : ''}`} id="step-4">
          <StepHeadline line1Key="planStep4HeadlineLine1" line2Key="planStep4HeadlineLine2" />
          <p className="step-sub">{t("Pace and budget — we'll tailor the itinerary around this.")}</p>

          <p className="section-kicker">{t('Pace')}</p>
          <div className="option-grid-3" style={{ marginBottom: 32 }}>
            {PACE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`option-card${pace === option.id ? ' active' : ''}`}
                onClick={() => {
                  setPace(option.id)
                  setStepNotice('')
                }}
              >
                <span className="material-symbols-outlined">{option.icon}</span>
                <span className="option-label">{t(option.label)}</span>
                <span className="option-sub">{t(option.sub)}</span>
              </button>
            ))}
          </div>

          <p className="section-kicker">{t('Budget')}</p>
          <div className="option-grid-3" style={{ marginBottom: 32 }}>
            {BUDGET_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`option-card${budget === option.id ? ' active' : ''}`}
                onClick={() => {
                  setBudget(option.id)
                  setStepNotice('')
                }}
              >
                <span className="material-symbols-outlined">{option.icon}</span>
                <span className="option-label">{t(option.label)}</span>
                <span className="option-sub">{t(option.sub)}</span>
              </button>
            ))}
          </div>

          <p className="section-kicker">
            {t('Anything else?')} <span className="section-kicker-optional">{t('(optional)')}</span>
          </p>
          <textarea
            className="prompt-area"
            rows={3}
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder={t("Type in Malay, Chinese, or English — e.g. 'not a resort person', 'halal food only', 'travelling with elderly parents'…")}
          />
          <p className="prompt-hint">{t('We understand Bahasa Malaysia, Mandarin, and English.')}</p>

          <div className="step-nav">
            <button type="button" className="btn-back" onClick={() => prevStep(4)}>
              <span className="material-symbols-outlined">arrow_back</span> {t('Back')}
            </button>
            <button type="button" className="btn-next" onClick={() => nextStep(4)}>
              {t('Review my trip')} <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Step 5 — Review */}
        <div className={`step-panel${currentStep === 5 ? ' active' : ''}`} id="step-5">
          <StepHeadline line1Key="planStep5HeadlineLine1" line2Key="planStep5HeadlineLine2" />
          <p className="step-sub">{t('Review your preferences before we build the itinerary.')}</p>

          <div className="review-block">
            <div className="review-row">
              <span className="review-key">{t('Route')}</span>
              <button type="button" className="review-edit" onClick={() => goToStep(1)}>
                {t('Edit')}
              </button>
            </div>
            <div className="review-val">{review.dest}</div>
            {review.segmentPlanLabel && (
              <div className="review-val review-val-sub">{review.segmentPlanLabel}</div>
            )}
            <div className="review-divider" />
            <div className="review-row">
              <span className="review-key">{t('Dates')}</span>
              <button type="button" className="review-edit" onClick={() => goToStep(2)}>
                {t('Edit')}
              </button>
            </div>
            <div className="review-val">{review.datesStr}</div>
            <div className="review-divider" />
            <div className="review-row">
              <span className="review-key">{t('Vibe')}</span>
              <button type="button" className="review-edit" onClick={() => goToStep(3)}>
                {t('Edit')}
              </button>
            </div>
            <div className="review-val">
              {review.vibeLabels.length > 0
                ? review.vibeLabels.map((label) => t(label)).join(', ')
                : '—'}
            </div>
            <div className="review-divider" />
            <div className="review-row">
              <span className="review-key">{t('Pace')}</span>
              <button type="button" className="review-edit" onClick={() => goToStep(4)}>
                {t('Edit')}
              </button>
            </div>
            <div className="review-val">{t(review.paceLabel)}</div>
            <div className="review-divider" />
            <div className="review-row">
              <span className="review-key">{t('Budget')}</span>
              <button type="button" className="review-edit" onClick={() => goToStep(4)}>
                {t('Edit')}
              </button>
            </div>
            <div className="review-val">{t(review.budgetLabel)}</div>
            {extraNotes.trim() && (
              <>
                <div className="review-divider" />
                <div className="review-row">
                  <span className="review-key">{t('Your requests')}</span>
                  <button type="button" className="review-edit" onClick={() => goToStep(4)}>
                    {t('Edit')}
                  </button>
                </div>
                <div className="review-val review-val-notes">{extraNotes.trim()}</div>
              </>
            )}
          </div>

          {generateError && <p className="modal-error" style={{ marginBottom: 16 }}>{generateError}</p>}

          <div className="step-nav">
            <button type="button" className="btn-back" onClick={() => prevStep(5)} disabled={generating}>
              <span className="material-symbols-outlined">arrow_back</span> {t('Back')}
            </button>
            <button
              type="button"
              className="btn-generate"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <>
                  <span className="material-symbols-outlined spin">hourglass_empty</span>
                  {t('Building your trip…')}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">auto_awesome</span>
                  {t('Generate my itinerary')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Login modal */}
      <div
        className={`modal-overlay${showLoginModal ? ' open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal()
        }}
        role="presentation"
      >
        <div className="plan-modal" role="dialog" aria-modal="true" aria-labelledby="plan-login-title">
          <button type="button" className="modal-close" onClick={closeModal} aria-label="Close">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              close
            </span>
          </button>
          <p className="modal-eyebrow">{t('One more step')}</p>
          <h2 className="modal-headline" id="plan-login-title">
            {t('planSignInHeadlineLine1')}
            <br />
            <em>{t('planSignInHeadlineLine2')}</em>
          </h2>
          <p className="modal-sub">
            {t('Sign in so we can add this itinerary to My Trips. You can still preview it without an account.')}
          </p>

          <div className="auth-v2" style={{ marginBottom: 12 }}>
            <SocialAuthButtons
              compact
              disabled={loginSubmitting}
              onGoogleSuccess={handleModalGoogleSuccess}
              onGoogleError={(message) => setLoginError(message)}
            />
          </div>

          <div className="modal-divider">
            <div className="modal-divider-line" />
            <span className="modal-divider-text">{t('or')}</span>
            <div className="modal-divider-line" />
          </div>

          <form onSubmit={handleModalLogin}>
            {loginError && <p className="modal-error">{loginError}</p>}
            <input
              className="modal-field"
              type="email"
              placeholder={t('Email address')}
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              className="modal-field"
              type="password"
              placeholder={t('Password')}
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button type="submit" className="modal-btn" disabled={loginSubmitting}>
              {loginSubmitting ? t('Signing in…') : t('Sign in & save')}
            </button>
          </form>

          <p className="modal-footer-text">
            {t('No account?')}{' '}
            <Link to="/register" state={{ background: location }}>
              {t('Sign up free')}
            </Link>{' '}
            — {t('takes 30 seconds.')}
          </p>
        </div>
      </div>
    </div>
  )
}
