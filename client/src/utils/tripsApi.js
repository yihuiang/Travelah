let fxRatesPromise = null

// Fetch FX rates (base MYR) once and reuse across the session.
export async function fetchFxRates() {
  if (!fxRatesPromise) {
    fxRatesPromise = fetch('/api/fx')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && data.rates ? data.rates : null))
      .catch(() => null)
  }
  return fxRatesPromise
}

export async function fetchTrip(tripId, authToken) {
  const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
  const data = await res.json().catch(() => ({}))
  return { res, trip: data }
}

export async function fetchTrips(authToken, { includeItinerary = false } = {}) {
  const query = includeItinerary ? '?includeItinerary=1' : ''
  const res = await fetch(`/api/trips${query}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
  const data = await res.json().catch(() => [])
  return { res, trips: Array.isArray(data) ? data : [] }
}

export async function saveTrip(payload, authToken) {
  const res = await fetch('/api/trips', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  return { res, trip: data }
}

export async function updateTripItinerary(tripId, itinerary, authToken) {
  return updateTrip(tripId, { itinerary }, authToken)
}

export async function updateTrip(tripId, patch, authToken) {
  const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  })
  const data = await res.json().catch(() => ({}))
  return { res, trip: data }
}

export async function updateTripPacking(tripId, packingList, authToken) {
  const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}/packing`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ packingList }),
  })
  const data = await res.json().catch(() => ({}))
  return { res, trip: data }
}

export async function updateTripBudget(tripId, budgetItems, authToken) {
  const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}/budget`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ budgetItems }),
  })
  const data = await res.json().catch(() => ({}))
  return { res, trip: data }
}

export async function updateTripBudgetCurrency(tripId, currency, authToken) {
  const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}/budget-currency`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ currency }),
  })
  const data = await res.json().catch(() => ({}))
  return { res, trip: data }
}

export async function deleteTrip(tripId, authToken) {
  const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` },
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}
