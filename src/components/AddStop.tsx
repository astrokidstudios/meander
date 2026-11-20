import { useState } from 'react'
import { addStop } from '../actions'
import { searchPlaces, useOnline, type GeoResult } from '../hooks'
import type { Stop, Trip } from '../db'
import { hasCoords } from '../utils'

/** Inline "add a place" box. Enter adds it straight away; Search looks it up on the map (online). */
export default function AddStop({ trip, day, stops, placeholder = 'Add a place…' }: { trip: Trip; day: number | null; stops: Stop[]; placeholder?: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<GeoResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const online = useOnline()

  // Bias the search towards where this trip's places already are.
  const geo = stops.filter(hasCoords)
  const near = geo.length ? { lat: geo.reduce((t, s) => t + s.lat, 0) / geo.length, lng: geo.reduce((t, s) => t + s.lng, 0) / geo.length } : null

  async function search() {
    if (!q.trim()) return
    setBusy(true)
    setErr('')
    try {
      const query = near || !trip.destination || q.toLowerCase().includes(trip.destination.toLowerCase()) ? q : `${q}, ${trip.destination}`
      let r = await searchPlaces(query, near)
      if (!r.length && query !== q) r = await searchPlaces(q, near)
      setResults(r)
      if (!r.length) setErr('No matches. Press “Add” to add it without a map pin.')
    } catch {
      setErr('Search needs internet. You can still add it and set the pin later.')
    } finally {
      setBusy(false)
    }
  }

  async function add(data: Partial<Stop>) {
    await addStop(trip.id, day, data)
    setQ('')
    setResults(null)
    setErr('')
  }

  return (
    <div className="add-stop">
      <form className="add-row" onSubmit={(e) => { e.preventDefault(); if (online) search(); else if (q.trim()) add({ name: q.trim() }) }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setResults(null) }} placeholder={placeholder} />
        {online && <button type="submit" className="btn small" disabled={!q.trim() || busy}>{busy ? '…' : 'Search'}</button>}
        <button type="button" className="btn small ghost" disabled={!q.trim()} onClick={() => add({ name: q.trim() })}>Add</button>
      </form>
      {err && <div className="muted small pad-s">{err}</div>}
      {results && results.length > 0 && (
        <ul className="results">
          {results.map((r, i) => (
            <li key={i}>
              <button onClick={() => add({ name: r.name, address: r.address, lat: r.lat, lng: r.lng, category: r.category })}>
                <strong>{r.name}</strong>
                <span className="muted small">{r.address}</span>
              </button>
            </li>
          ))}
          <li className="muted small pad-s">Search data © OpenStreetMap contributors</li>
        </ul>
      )}
    </div>
  )
}
