import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents, CircleMarker } from 'react-leaflet'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Stop, type TravelMode, type Trip } from '../db'
import { useRoadLegs } from '../routing'
import { addStop, stopsForDay } from '../actions'
import { addDays, dayColor, dayCount, fmtDate, hasCoords, STOP_CATS } from '../utils'

type Focus = number | 'all' | 'saved'

function pinIcon(color: string, label: string, dim: boolean) {
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="pin ${dim ? 'dim' : ''}" style="--c:${color}"><span>${label}</span></div>`,
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -32],
  })
}

function FitBounds({ points, signature }: { points: [number, number][]; signature: string }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    try {
      map.invalidateSize()
      if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 14), { animate: false })
      else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16, animate: false })
    } catch {
      /* map was unmounted mid-update */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])
  useEffect(() => {
    // The map's container can change size (tab switches, side panel) — keep tiles filled.
    const ro = new ResizeObserver(() => { try { map.invalidateSize() } catch { /* unmounted */ } })
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

function ClickToAdd({ active, onPick }: { active: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => active && onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

function getPosition(opts: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts))
}

/** Where to fix location access, in the words of the device the person is on. */
function permissionHelp() {
  const ua = navigator.userAgent
  if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return 'iPhone Settings → Meander → Location → “While Using the App”.'
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (ios) return 'iPhone Settings → Privacy & Security → Location Services → Safari Websites → “While Using the App”, then fully close and reopen Meander.'
  if (/Electron/.test(ua) && /Mac/.test(ua)) return 'Mac System Settings → Privacy & Security → Location Services → turn on Meander, then reopen it.'
  if (/Mac/.test(ua)) return 'Mac System Settings → Privacy & Security → Location Services → turn on your browser, and allow location for this site.'
  return 'Windows Settings → Privacy & security → Location → turn on location (and “Let apps access your location”).'
}

function LocateMe({ onFound, onMessage }: { onFound: (p: [number, number]) => void; onMessage: (m: string) => void }) {
  const map = useMap()
  const [busy, setBusy] = useState(false)
  async function locate() {
    if (!navigator.geolocation) return onMessage('Location isn’t available on this device.')
    setBusy(true)
    onMessage('')
    try {
      let pos: GeolocationPosition
      try {
        // Quick GPS fix (a recent one is fine)…
        pos = await getPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 })
      } catch (err) {
        if ((err as GeolocationPositionError).code === 1) throw err
        // …and if GPS is slow (indoors, poor signal), fall back to a rougher network/Wi-Fi fix.
        pos = await getPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 })
      }
      const p: [number, number] = [pos.coords.latitude, pos.coords.longitude]
      onFound(p)
      map.setView(p, 15)
    } catch (err) {
      const code = (err as GeolocationPositionError).code
      onMessage(code === 1
        ? `Location is blocked for Meander. To allow it: ${permissionHelp()}`
        : code === 3
          ? 'Couldn’t get a location fix in time. Try again, ideally near a window or outside.'
          : 'Your device couldn’t work out where you are right now. Check Location Services is on and try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button className="map-btn" title="Show my location" onClick={(e) => { e.stopPropagation(); locate() }}>{busy ? '…' : '◎'}</button>
  )
}

export default function TripMap({ trip, stops, onEdit, focusDay, setFocusDay, full }: {
  trip: Trip
  stops: Stop[]
  onEdit: (s: Stop) => void
  focusDay: Focus
  setFocusDay: (d: number | 'all') => void
  full?: boolean
}) {
  const [dropping, setDropping] = useState(false)
  const [me, setMe] = useState<[number, number] | null>(null)
  const [locMsg, setLocMsg] = useState('')
  const [showSaved, setShowSaved] = useState(true)
  const n = dayCount(trip.startDate, trip.endDate)
  const geo = stops.filter(hasCoords)

  const isShown = (s: Stop) => {
    if (focusDay === 'all') return s.day !== null || showSaved
    if (focusDay === 'saved') return true
    return true
  }
  const isDim = (s: Stop) => (focusDay === 'all' ? false : focusDay === 'saved' ? s.day !== null : s.day !== focusDay)

  const visible = geo.filter(isShown)
  const focusPts = visible.filter((s) => !isDim(s))
  const fitPts: [number, number][] = (focusPts.length ? focusPts : visible).map((s) => [s.lat, s.lng])
  const signature = `${focusDay}|${fitPts.length}|${fitPts.length ? fitPts[0].join() : ''}`

  const metas = useLiveQuery(() => db.days.where('tripId').equals(trip.id).toArray(), [trip.id]) ?? []
  const dayStops = Array.from({ length: n }, (_, d) => stopsForDay(stops, d))
  const road = useRoadLegs(dayStops.map((list, d) => ({ stops: list, mode: (metas.find((m) => m.day === d)?.mode ?? 'auto') as TravelMode })), focusDay)

  // Each leg is drawn along the real road once its route is known, otherwise as a dashed straight line.
  const lines = useMemo(() => {
    const out: { key: string; day: number; pts: [number, number][]; road: boolean }[] = []
    dayStops.forEach((list, d) => {
      list.forEach((s, i) => {
        const prev = list[i - 1]
        if (!prev || !hasCoords(prev) || !hasCoords(s)) return
        const r = road[d]?.legs.get(i)
        out.push({ key: `${d}-${i}`, day: d, pts: r ? r.geom : [[prev.lat, prev.lng], [s.lat, s.lng]], road: !!r })
      })
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, n, road.map((r) => r.legs.size).join()])

  const indexInDay = (s: Stop) => (s.day === null ? -1 : stopsForDay(stops, s.day).findIndex((x) => x.id === s.id))

  async function onPick(lat: number, lng: number) {
    const name = prompt('Name this place:', 'Dropped pin')
    setDropping(false)
    if (name === null) return
    const day = typeof focusDay === 'number' ? focusDay : null
    const s = await addStop(trip.id, day, { name: name.trim() || 'Dropped pin', lat, lng, category: 'other' })
    onEdit(s)
  }

  return (
    <div className={`map-wrap ${full ? 'full' : ''} ${dropping ? 'dropping' : ''}`}>
      <MapContainer center={[30, 0]} zoom={2} className="map" worldCopyJump>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · routes: OSRM / FOSSGIS'
          maxZoom={19}
        />
        <FitBounds points={fitPts} signature={signature} />
        <ClickToAdd active={dropping} onPick={onPick} />
        {lines.map((l) => {
          const on = focusDay === 'all' || focusDay === l.day
          return (
            <Polyline key={l.key + (l.road ? 'r' : 's')} positions={l.pts} pathOptions={l.road
              ? { color: dayColor(l.day), weight: on ? 5 : 3, opacity: on ? 0.9 : 0.15, lineCap: 'round', lineJoin: 'round' }
              : { color: dayColor(l.day), weight: 3, opacity: on ? 0.6 : 0.12, dashArray: '6 8' }} />
          )
        })}
        {visible.map((s) => {
          const i = indexInDay(s)
          const label = s.day === null ? '★' : String(i + 1)
          return (
            <Marker key={s.id} position={[s.lat, s.lng]} icon={pinIcon(dayColor(s.day), label, isDim(s))} zIndexOffset={isDim(s) ? 0 : 1000}>
              <Popup>
                <div className="popup">
                  <strong>{STOP_CATS[s.category]?.icon} {s.name}</strong>
                  <div className="muted small">{s.day === null ? 'Saved place' : `Day ${s.day + 1}${trip.startDate ? ' · ' + fmtDate(addDays(trip.startDate, s.day), { weekday: 'short', day: 'numeric', month: 'short' }) : ''}${s.time ? ' · ' + s.time : ''}`}</div>
                  {s.notes && <div className="small">{s.notes}</div>}
                  <button className="btn tiny" onClick={() => onEdit(s)}>Edit</button>
                </div>
              </Popup>
            </Marker>
          )
        })}
        {me && <CircleMarker center={me} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1982c4', fillOpacity: 1 }} />}
        <div className="map-controls" ref={(el) => { if (el) { L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el) } }}>
          <LocateMe onFound={setMe} onMessage={setLocMsg} />
          <button className={`map-btn ${dropping ? 'on' : ''}`} title="Drop a pin" onClick={(e) => { e.stopPropagation(); setDropping((d) => !d) }}>📍</button>
        </div>
      </MapContainer>
      {locMsg && <button className="map-msg" onClick={() => setLocMsg('')}>{locMsg} <b>✕</b></button>}
      {dropping && <div className="map-hint">Tap the map to add a place{typeof focusDay === 'number' ? ` to day ${focusDay + 1}` : ' to Saved'}</div>}
      {full && (
        <div className="map-days">
          <button className={`chip ${focusDay === 'all' ? 'on' : ''}`} onClick={() => setFocusDay('all')}>All</button>
          {Array.from({ length: n }, (_, d) => (
            <button key={d} className={`chip ${focusDay === d ? 'on' : ''}`} onClick={() => setFocusDay(d)}><i style={{ background: dayColor(d) }} />Day {d + 1}</button>
          ))}
          <label className="chip"><input type="checkbox" checked={showSaved} onChange={(e) => setShowSaved(e.target.checked)} /> Saved</label>
        </div>
      )}
      {geo.length === 0 && <div className="map-empty muted small">Places with a location show up here. Search for a place or drop a pin.</div>}
    </div>
  )
}
