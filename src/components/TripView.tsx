import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, deleteTrip, exportData, type Stop } from '../db'
import { downloadJSON, fmtRange, slug } from '../utils'
import { go, type Tab } from '../App'
import Itinerary from './Itinerary'
import SavedPlaces from './SavedPlaces'
import TripMap from './TripMap'
import Budget from './Budget'
import Notes from './Notes'
import TripForm from './TripForm'
import StopEditor from './StopEditor'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'plan', label: 'Itinerary', icon: '🗓️' },
  { id: 'places', label: 'Saved', icon: '⭐' },
  { id: 'map', label: 'Map', icon: '🗺️' },
  { id: 'budget', label: 'Budget', icon: '💷' },
  { id: 'notes', label: 'Notes', icon: '📝' },
]

export default function TripView({ tripId, tab }: { tripId: string; tab: Tab }) {
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId], null)
  const stops = useLiveQuery(() => db.stops.where('tripId').equals(tripId).toArray(), [tripId]) ?? []
  const [editingTrip, setEditingTrip] = useState(false)
  const [editing, setEditing] = useState<Stop | null>(null)
  const [focusDay, setFocusDay] = useState<number | 'all'>('all')
  const [menu, setMenu] = useState(false)

  if (trip === null) return <div className="center muted">Loading…</div>
  if (!trip) {
    return (
      <div className="center">
        <p>This trip doesn’t exist on this device.</p>
        <button className="btn primary" onClick={() => go('/')}>Back to trips</button>
      </div>
    )
  }

  const showSideMap = tab === 'plan' || tab === 'places'

  return (
    <div className="trip" style={{ '--trip': trip.color } as React.CSSProperties}>
      <header className="trip-head">
        <button className="icon-btn" onClick={() => go('/')} aria-label="All trips">‹</button>
        <div className="trip-title" onClick={() => setEditingTrip(true)} title="Edit trip">
          <h1>{trip.name}</h1>
          <div className="muted small">{trip.destination ? `${trip.destination} · ` : ''}{fmtRange(trip.startDate, trip.endDate)}</div>
        </div>
        <div className="menu-wrap">
          <button className="icon-btn" onClick={() => setMenu((m) => !m)} aria-label="Trip menu">⋯</button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => { setMenu(false); setEditingTrip(true) }}>Edit trip details</button>
              <button onClick={() => { setMenu(false); go(`/trip/${tripId}/plan`); setTimeout(() => window.print(), 300) }}>Print / save as PDF</button>
              <button onClick={async () => { setMenu(false); downloadJSON(await exportData(tripId), `meander-${slug(trip.name)}.json`) }}>Export this trip (file)</button>
              <button className="danger" onClick={async () => { setMenu(false); if (confirm(`Delete “${trip.name}” and everything in it? This can’t be undone.`)) { await deleteTrip(tripId); go('/') } }}>Delete trip</button>
            </div>
          )}
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''} ${t.id === 'map' ? 'tab-map' : ''}`} onClick={() => go(`/trip/${tripId}/${t.id}`)}>
            <span className="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main className={`trip-main ${showSideMap ? 'with-side' : ''} tab-${tab}`}>
        <section className="trip-content">
          {tab === 'plan' && <Itinerary trip={trip} stops={stops} onEdit={setEditing} focusDay={focusDay} setFocusDay={setFocusDay} />}
          {tab === 'places' && <SavedPlaces trip={trip} stops={stops} onEdit={setEditing} />}
          {tab === 'map' && <TripMap trip={trip} stops={stops} onEdit={setEditing} focusDay={focusDay} setFocusDay={setFocusDay} full />}
          {tab === 'budget' && <Budget trip={trip} stops={stops} />}
          {tab === 'notes' && <Notes trip={trip} />}
        </section>
        {showSideMap && (
          <aside className="side-map">
            <TripMap trip={trip} stops={stops} onEdit={setEditing} focusDay={tab === 'places' ? 'saved' : focusDay} setFocusDay={setFocusDay} />
          </aside>
        )}
      </main>

      {editingTrip && <TripForm trip={trip} onClose={() => setEditingTrip(false)} />}
      {editing && <StopEditor trip={trip} stop={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
