import { db, type Stop, type Trip } from '../db'
import { moveStopToDay, nudge } from '../actions'
import { addDays, dayColor, dayCount, fmtDate, money, STOP_CATS } from '../utils'

export function DaySelect({ trip, value, onChange, savedLabel = 'Saved (no day)' }: { trip: Trip; value: number | null; onChange: (d: number | null) => void; savedLabel?: string }) {
  const n = dayCount(trip.startDate, trip.endDate)
  return (
    <select value={value === null ? '' : value} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">{savedLabel}</option>
      {Array.from({ length: n }, (_, d) => (
        <option key={d} value={d}>Day {d + 1}{trip.startDate ? ` · ${fmtDate(addDays(trip.startDate, d), { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}</option>
      ))}
    </select>
  )
}

export default function StopRow({ stop, index, trip, all, onEdit, isFirst, isLast }: {
  stop: Stop
  index: number
  trip: Trip
  all: Stop[]
  onEdit: (s: Stop) => void
  isFirst: boolean
  isLast: boolean
}) {
  const cat = STOP_CATS[stop.category] ?? STOP_CATS.other
  return (
    <div className={`stop ${stop.done ? 'done' : ''}`}>
      <div className="stop-badge" style={{ background: dayColor(stop.day) }}>{stop.day === null ? cat.icon : index + 1}</div>
      <button className="stop-main" onClick={() => onEdit(stop)}>
        <div className="stop-line1">
          {stop.time && <span className="stop-time">{stop.time}{stop.endTime ? `–${stop.endTime}` : ''}</span>}
          <span className="stop-name">{stop.day !== null && <span className="cat-icon">{cat.icon}</span>}{stop.name}</span>
        </div>
        {(stop.notes || stop.address) && <div className="stop-sub muted small">{stop.notes || stop.address}</div>}
        <div className="stop-tags">
          {stop.cost > 0 && <span className="tag">{money(stop.cost, trip.currency)}</span>}
          {stop.booking && <span className="tag">🎫 {stop.booking}</span>}
          {stop.lat === null && <span className="tag warn">no pin</span>}
        </div>
      </button>
      <div className="stop-actions no-print">
        {stop.day !== null && (
          <label className="check" title="Mark as done">
            <input type="checkbox" checked={stop.done} onChange={(e) => db.stops.update(stop.id, { done: e.target.checked })} />
          </label>
        )}
        <button className="icon-btn sm" disabled={isFirst} onClick={() => nudge(stop, -1, all)} aria-label="Move up">▲</button>
        <button className="icon-btn sm" disabled={isLast} onClick={() => nudge(stop, 1, all)} aria-label="Move down">▼</button>
        <div className="move-day" title="Move to day">
          <DaySelect trip={trip} value={stop.day} onChange={(d) => moveStopToDay(stop, d, all)} savedLabel="⭐ Saved" />
        </div>
      </div>
    </div>
  )
}
