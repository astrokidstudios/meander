import { useState } from 'react'
import { db, touchTrip, type Stop, type StopCategory, type Trip } from '../db'
import { duplicateStop, moveStopToDay } from '../actions'
import { searchPlaces, useOnline, type GeoResult } from '../hooks'
import { STOP_CATS } from '../utils'
import Modal from './Modal'
import { DaySelect, DurationSelect } from './StopRow'

/** Pulls coordinates out of a pasted map link or "lat, lng" text. */
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const pats = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // google .../@51.5,-0.12,15z
    /[?&](?:q|ll|query|destination|daddr)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i, // ?q=lat,lng
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // google place data
    /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/, // plain "lat, lng"
  ]
  for (const p of pats) {
    const m = text.match(p)
    if (m) {
      const lat = Number(m[1])
      const lng = Number(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
    }
  }
  return null
}

export default function StopEditor({ trip, stop, onClose }: { trip: Trip; stop: Stop; onClose: () => void }) {
  const [f, setF] = useState<Stop>(stop)
  const [loc, setLoc] = useState('')
  const [results, setResults] = useState<GeoResult[] | null>(null)
  const [locMsg, setLocMsg] = useState('')
  const online = useOnline()
  const set = <K extends keyof Stop>(k: K, v: Stop[K]) => setF((p) => ({ ...p, [k]: v }))

  async function save() {
    const { day, ...rest } = f
    await db.stops.update(stop.id, { ...rest, name: rest.name.trim() || 'Untitled place' })
    if (day !== stop.day) {
      const all = await db.stops.where('tripId').equals(trip.id).toArray()
      await moveStopToDay({ ...stop, ...rest }, day, all)
    }
    await touchTrip(trip.id)
    onClose()
  }

  async function findLocation() {
    const coords = parseCoords(loc)
    if (coords) {
      setF((p) => ({ ...p, ...coords }))
      setLocMsg('Pin set from the link/coordinates.')
      return
    }
    try {
      const r = await searchPlaces(loc || `${f.name}${trip.destination ? ', ' + trip.destination : ''}`)
      setResults(r)
      setLocMsg(r.length ? '' : 'No matches found.')
    } catch {
      setLocMsg('Search needs internet. Paste coordinates or a map link instead.')
    }
  }

  const coord = f.lat !== null && f.lng !== null ? `${f.lat},${f.lng}` : ''
  const q = encodeURIComponent(coord || [f.name, f.address || trip.destination].filter(Boolean).join(', '))

  return (
    <Modal
      title="Place details"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost danger-text" onClick={async () => { if (confirm(`Remove “${stop.name}”?`)) { await db.stops.delete(stop.id); onClose() } }}>Delete</button>
          <button className="btn ghost" onClick={async () => { await duplicateStop(stop); onClose() }}>Duplicate</button>
          <span className="spacer" />
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label>Name<input value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
        <div className="grid2">
          <label>Type
            <select value={f.category} onChange={(e) => set('category', e.target.value as StopCategory)}>
              {(Object.keys(STOP_CATS) as StopCategory[]).map((c) => <option key={c} value={c}>{STOP_CATS[c].icon} {STOP_CATS[c].label}</option>)}
            </select>
          </label>
          <label>Day<DaySelect trip={trip} value={f.day} onChange={(d) => set('day', d)} /></label>
        </div>
        <div className="grid3">
          <label>Time spent here<DurationSelect value={f.duration ?? 0} onChange={(m) => set('duration', m)} /></label>
          <label title="Only for things booked at a set time, e.g. a tour or table">Fixed time (booking)<input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} /></label>
          <label>Cost ({trip.currency})<input type="number" min={0} step="0.01" inputMode="decimal" value={f.cost || ''} onChange={(e) => set('cost', Number(e.target.value))} placeholder="0" /></label>
        </div>
        <label>Travel time to here (minutes)<input type="number" min={0} value={f.travelMins ?? ''} onChange={(e) => set('travelMins', e.target.value === '' ? null : Number(e.target.value))} placeholder="Leave empty to estimate from the map" /></label>
        <label>Booking / confirmation no.<input value={f.booking} onChange={(e) => set('booking', e.target.value)} placeholder="e.g. flight number, hotel reference" /></label>
        <label>Notes<textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Opening hours, what to order, tips…" /></label>
        <label>Link<input type="url" value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" /></label>

        <fieldset className="loc">
          <legend>Location</legend>
          <label>Address<input value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
          <div className="add-row">
            <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder={online ? 'Search, or paste a map link / “lat, lng”' : 'Paste a map link or “lat, lng”'} />
            <button type="button" className="btn small" onClick={findLocation}>Find</button>
          </div>
          {locMsg && <div className="muted small">{locMsg}</div>}
          {results && results.length > 0 && (
            <ul className="results">
              {results.map((r, i) => (
                <li key={i}><button type="button" onClick={() => { setF((p) => ({ ...p, lat: r.lat, lng: r.lng, address: r.address })); setResults(null); setLocMsg('Pin updated.') }}><strong>{r.name}</strong><span className="muted small">{r.address}</span></button></li>
              ))}
            </ul>
          )}
          <div className="grid2">
            <label>Latitude<input type="number" step="any" value={f.lat ?? ''} onChange={(e) => set('lat', e.target.value === '' ? null : Number(e.target.value))} /></label>
            <label>Longitude<input type="number" step="any" value={f.lng ?? ''} onChange={(e) => set('lng', e.target.value === '' ? null : Number(e.target.value))} /></label>
          </div>
          <div className="row gap wrap small">
            <a className="btn tiny ghost" href={`https://maps.apple.com/?q=${q}`} target="_blank" rel="noreferrer">Open in Apple Maps</a>
            <a className="btn tiny ghost" href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer">Open in Google Maps</a>
            <a className="btn tiny ghost" href={`https://www.google.com/maps/dir/?api=1&destination=${q}`} target="_blank" rel="noreferrer">Directions</a>
            {f.lat !== null && <button type="button" className="btn tiny ghost" onClick={() => setF((p) => ({ ...p, lat: null, lng: null }))}>Remove pin</button>}
          </div>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
