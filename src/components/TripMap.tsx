import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents, CircleMarker } from 'react-leaflet'
import type { Stop, Trip } from '../db'
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

function LocateMe({ onFound }: { onFound: (p: [number, number]) => void }) {
  const map = useMap()
  const [busy, setBusy] = useState(false)
  return (
    <button
      className="map-btn"
      title="Show my location"
      onClick={(e) => {
        e.stopPropagation()
        if (!navigator.geolocation) return alert('Location isn’t available on this device.')
        setBusy(true)
        navigator.geolocation.getCurrentPosition(
          (pos) => { const p: [number, number] = [pos.coords.latitude, pos.coords.longitude]; onFound(p); map.setView(p, 15); setBusy(false) },
          () => { alert('Couldn’t get your location. Check location permissions.'); setBusy(false) },
          { enableHighAccuracy: true, timeout: 15000 },
        )
      }}
    >{busy ? '…' : '◎'}</button>
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

  const lines = useMemo(() => {
    const out: { day: number; pts: [number, number][] }[] = []
    for (let d = 0; d < n; d++) {
      const pts = stopsForDay(stops, d).filter(hasCoords).map((s) => [s.lat, s.lng] as [number, number])
      if (pts.length > 1) out.push({ day: d, pts })
    }
    return out
  }, [stops, n])

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
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        <FitBounds points={fitPts} signature={signature} />
        <ClickToAdd active={dropping} onPick={onPick} />
        {lines.map((l) => (
          <Polyline key={l.day} positions={l.pts} pathOptions={{ color: dayColor(l.day), weight: 4, opacity: focusDay === 'all' || focusDay === l.day ? 0.85 : 0.15, dashArray: '6 8' }} />
        ))}
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
          <LocateMe onFound={setMe} />
          <button className={`map-btn ${dropping ? 'on' : ''}`} title="Drop a pin" onClick={(e) => { e.stopPropagation(); setDropping((d) => !d) }}>📍</button>
        </div>
      </MapContainer>
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
