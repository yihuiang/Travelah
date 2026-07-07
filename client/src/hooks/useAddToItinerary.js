import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth, getAuthToken } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { translateTemplate } from '../i18n/template.js'
import { useTimedToast } from './useTimedToast.js'
import {
  appendPlaceToTripItinerary,
  buildDayOptions,
  getTripDisplayName,
  isPlaceInItinerary,
  resolveAddTarget,
  selectTripForState,
} from '../utils/addToItinerary.js'
import { fetchTrips, updateTripItinerary } from '../utils/tripsApi.js'

export function useAddToItinerary() {
  const { isAuthenticated, token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()
  const { toast, showToast } = useTimedToast()
  const [loading, setLoading] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const cancelConfirm = useCallback(() => {
    if (loading) return
    setConfirm(null)
  }, [loading])

  const confirmAdd = useCallback(
    async (dayIndexOverride) => {
      if (!confirm) return

      const authToken = token || getAuthToken()
      if (!authToken) {
        navigate('/login', { state: { background: location } })
        return
      }

      const dayIndex =
        typeof dayIndexOverride === 'number' ? dayIndexOverride : confirm.dayIndex
      const { place, trip } = confirm
      setLoading(true)
      try {
        const updatedItinerary = appendPlaceToTripItinerary(trip.itinerary, place, dayIndex)
        const { res: patchRes } = await updateTripItinerary(trip.id, updatedItinerary, authToken)
        if (!patchRes.ok) throw new Error('patch failed')

        setConfirm(null)
        showToast({
          message: t('Added to your itinerary'),
          icon: 'add_location',
          linkTo: `/itinerary/trip/${encodeURIComponent(trip.id)}`,
          linkLabel: t('View'),
        })
      } catch {
        showToast({
          message: t('Could not add to itinerary'),
          icon: 'error',
        })
      } finally {
        setLoading(false)
      }
    },
    [confirm, token, navigate, location, t, showToast],
  )

  const addToItinerary = useCallback(
    async (place) => {
      if (!place) return

      if (!isAuthenticated) {
        navigate('/login', { state: { background: location } })
        return
      }

      const authToken = token || getAuthToken()
      if (!authToken) {
        navigate('/login', { state: { background: location } })
        return
      }

      const placeId = place.id || place._id
      const placeState = place.state || null
      const planLinkState = {
        from: location.pathname,
        planSeed: placeState ? { destination: placeState } : undefined,
      }

      setLoading(true)
      try {
        const { res, trips } = await fetchTrips(authToken, { includeItinerary: true })
        if (!res.ok) throw new Error('load trips failed')

        if (!trips.length) {
          showToast({
            message: t("You don't have any trips yet"),
            icon: 'luggage',
            linkTo: '/plan',
            linkLabel: t('Create a trip'),
            linkState: planLinkState,
          })
          return
        }

        const trip = selectTripForState(trips, placeState)
        if (!trip) {
          showToast({
            message: translateTemplate(t, 'No trip found for {{state}}', {
              state: placeState || t('this state'),
            }),
            icon: 'info',
            linkTo: '/plan',
            linkLabel: t('Create a trip'),
            linkState: planLinkState,
          })
          return
        }

        if (!trip.itinerary?.days?.length) {
          showToast({
            message: t('Open your trip to generate an itinerary first'),
            icon: 'route',
            linkTo: `/itinerary/trip/${encodeURIComponent(trip.id)}`,
            linkLabel: t('View trip'),
          })
          return
        }

        if (placeId && isPlaceInItinerary(trip.itinerary, placeId)) {
          showToast({
            message: t('Already in your itinerary'),
            icon: 'check_circle',
            linkTo: `/itinerary/trip/${encodeURIComponent(trip.id)}`,
            linkLabel: t('View'),
          })
          return
        }

        const { dayIndex } = resolveAddTarget(trip, place)
        setConfirm({
          place,
          trip,
          dayIndex,
          tripName: getTripDisplayName(trip),
          dayOptions: buildDayOptions(trip.itinerary, t, translateTemplate),
        })
      } catch {
        showToast({
          message: t('Could not add to itinerary'),
          icon: 'error',
        })
      } finally {
        setLoading(false)
      }
    },
    [isAuthenticated, token, navigate, location, t, showToast],
  )

  return { addToItinerary, confirmAdd, cancelConfirm, confirm, loading, toast }
}
