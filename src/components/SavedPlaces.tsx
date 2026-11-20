import { useState } from 'react'
import type { Stop, StopCategory, Trip } from '../db'
import { stopsForDay } from '../actions'
import { STOP_CATS } from '../utils'
import StopRow from './StopRow'
import AddStop from './AddStop'

export default function SavedPlaces({ trip, stops, onEdit }: { trip: Trip; stops: Stop[]; onEdit: (s: Stop) => void }) {
  const [cat, setCat] = useState<StopCategory | 'all'>('all')
  const all = stopsForDay(stops, null)
  const list = cat === 'all' ? all : all.filter((s) => s.category === cat)
  const used = new Set(all.map((s) => s.category))
  return (
    <div className="saved">
      <div className="panel-intro">
        <h2>Saved places</h2>
        <p className="muted small">Your wishlist. Collect places here, then use the day picker on each one to put it into the itinerary.</p>
      </div>
      <AddStop trip={trip} day={null} stops={stops} placeholder="Search or type a place to save…" />
      {used.size > 1 && (
        <div className="day-chips">
          <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All ({all.length})</button>
          {(Object.keys(STOP_CATS) as StopCategory[]).filter((c) => used.has(c)).map((c) => (
            <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{STOP_CATS[c].icon} {STOP_CATS[c].label}</button>
          ))}
        </div>
      )}
      {all.length === 0 && <p className="muted pad">No saved places yet. Search above, or drop a pin on the map.</p>}
      <div className="stop-list">
        {list.map((s, i) => (
          <StopRow key={s.id} stop={s} index={i} trip={trip} all={stops} onEdit={onEdit} isFirst={i === 0} isLast={i === list.length - 1} />
        ))}
      </div>
    </div>
  )
}
