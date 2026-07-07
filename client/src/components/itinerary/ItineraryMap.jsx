import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { splitDayActivities } from '../../utils/reorderItineraryDay.js'
import { useLanguage } from '../../context/LanguageContext.jsx'

const ROUTE_COLOR = '#2bb8a6'
const MALAYSIA_CENTER = [4.2105, 108.9758]
const DEFAULT_ZOOM = 11
const FIT_BOUNDS_PADDING = [56, 56]

function fitMapToPins(map, pins) {
  if (!map || !pins.length) return
  const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng])).pad(0.12)
  map.fitBounds(bounds, {
    animate: true,
    maxZoom: 15,
    paddingTopLeft: FIT_BOUNDS_PADDING,
    paddingBottomRight: FIT_BOUNDS_PADDING,
  })
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stopPayload(stop, day) {
  return {
    pin: stop.pin,
    name: stop.name,
    type: stop.type || null,
    placeId: stop.placeId || null,
    googlePlaceId: stop.googlePlaceId || null,
    location: stop.location || null,
    state: stop.state || day?.destination || null,
    lat: stop.lat ?? null,
    lng: stop.lng ?? null,
    formattedAddress: stop.note || null,
    destination: day?.destination || null,
  }
}

function useItineraryPins(day) {
  const [pins, setPins] = useState([])
  const [loading, setLoading] = useState(true)

  const { stops } = useMemo(
    () => splitDayActivities(day?.activities || []),
    [day?.activities],
  )

  const stopsKey = useMemo(
    () => stops.map((s) => `${s.id}:${s.pin}:${s.name}`).join('|'),
    [stops],
  )

  useEffect(() => {
    if (!stops.length) {
      setPins([])
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)

    fetch('/api/map/resolve-stops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: stops.map((stop) => stopPayload(stop, day)) }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setPins(Array.isArray(data.pins) ? data.pins : [])
      })
      .catch(() => {
        if (!cancelled) setPins([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [stopsKey, day?.id, day?.destination])

  return { pins, loading }
}

function MapChrome({ day, loading, onFitRoute, onResetView, children }) {
  return (
    <div className="map-panel-inner">
      <div className="map-day-badge">
        <p className="map-day-badge-label">Day {day?.num} route</p>
        <p className="map-day-badge-title">{day?.title}</p>
      </div>

      {children}

      {loading && (
        <div className="itin-map-loading">
          <span className="material-symbols-outlined spin">hourglass_empty</span>
          Loading map…
        </div>
      )}

      <div className="itin-map-controls">
        <button type="button" className="itin-map-control-btn" onClick={onFitRoute} title="Fit route">
          <span className="material-symbols-outlined">fit_screen</span>
        </button>
        <button type="button" className="itin-map-control-btn" onClick={onResetView} title="Reset view">
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>
    </div>
  )
}

function createLeafletIcon(pin, active) {
  const kind = pin.kind || 'place'
  const label = escapeHtml(pin.label || pin.name || '')
  const activeClass = active ? ' is-active' : ''
  const kindClass = kind !== 'place' ? ` is-${kind}` : ''

  return L.divIcon({
    className: 'itin-leaflet-marker',
    html: `
      <div class="itin-map-marker${activeClass}${kindClass}">
        <div class="itin-map-marker-dot">${pin.pin}</div>
        <span class="itin-map-marker-label" title="${label}">${label}</span>
      </div>
    `,
    iconSize: [1, 1],
    iconAnchor: [14, 14],
  })
}

export default function ItineraryMap({ day, activePin, onPinClick }) {
  const { tPlaceName } = useLanguage()
  const { pins, loading } = useItineraryPins(day)
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersLayerRef = useRef(null)
  const routeLayerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView(MALAYSIA_CENTER, DEFAULT_ZOOM)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map)

    routeLayerRef.current = L.layerGroup().addTo(map)
    markersLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    const timers = [120, 400, 900].map((ms) => setTimeout(() => map.invalidateSize(), ms))

    return () => {
      timers.forEach(clearTimeout)
      map.remove()
      mapRef.current = null
      markersLayerRef.current = null
      routeLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const markersLayer = markersLayerRef.current
    const routeLayer = routeLayerRef.current
    if (!map || !markersLayer || !routeLayer) return

    markersLayer.clearLayers()
    routeLayer.clearLayers()

    if (!pins.length) return

    const latLngs = pins.map((p) => [p.lat, p.lng])

    if (latLngs.length > 1) {
      L.polyline(latLngs, {
        color: ROUTE_COLOR,
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayer)
    }

    pins.forEach((pin) => {
      const displayPin = { ...pin, label: tPlaceName(pin.label || pin.name) }
      const marker = L.marker([pin.lat, pin.lng], {
        icon: createLeafletIcon(displayPin, activePin === pin.pin),
        zIndexOffset: activePin === pin.pin ? 1000 : pin.pin * 10,
      })
      marker.on('click', () => onPinClick(pin.pin))
      marker.addTo(markersLayer)
    })

    fitMapToPins(map, pins)
  }, [pins, activePin, onPinClick, tPlaceName])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const t = setTimeout(() => map.invalidateSize(), 120)
    return () => clearTimeout(t)
  }, [pins.length, loading])

  const fitRoute = () => {
    fitMapToPins(mapRef.current, pins)
  }

  return (
    <MapChrome
      day={day}
      loading={loading}
      onFitRoute={fitRoute}
      onResetView={() => mapRef.current?.setView(MALAYSIA_CENTER, DEFAULT_ZOOM)}
    >
      <div ref={containerRef} className="itin-leaflet-map" aria-label={`Day ${day?.num} route map`} />
    </MapChrome>
  )
}
