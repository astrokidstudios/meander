import { useEffect, useRef, useState } from 'react'
import { db, type Stop, type Trip } from '../db'
import { duplicateStop, moveStopToDay, nudge, stopsForDay } from '../actions'
import { addDays, dayColor, dayCount, fmtClock, fmtDate, fmtDuration, money, STOP_CATS, type StopTiming } from '../utils'
import { celebrate } from './Confetti'

const DURATIONS = [0, 15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480]

export function DurationSelect({ value, onChange, compact }: { value: number; onChange: (m: number) => void; compact?: boolean }) {
  const opts = DURATIONS.includes(value) ? DURATIONS : [...DURATIONS, value].sort((a, b) => a - b)
  return (
    <select className={compact ? 'dur-select' : ''} value={value} onChange={(e) => onChange(Number(e.target.value))} title="How long you stay here">
      {opts.map((m) => <option key={m} value={m}>{m === 0 ? (compact ? '⏳ –' : 'Not set') : (compact ? `⏳ ${fmtDuration(m)}` : fmtDuration(m))}</option>)}
    </select>
  )
}

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

async function toggleDone(stop: Stop, all: Stop[]) {
  const done = !stop.done
  await db.stops.update(stop.id, { done })
  if (done && stop.day !== null) {
    const day = stopsForDay(all, stop.day)
    if (day.every((s) => s.id === stop.id || s.done)) celebrate(`Day ${stop.day + 1} complete!`)
  }
}

export default function StopRow({ stop, index, trip, all, onEdit, isFirst, isLast, timing }: {
  stop: Stop
  index: number
  trip: Trip
  all: Stop[]
  onEdit: (s: Stop) => void
  isFirst: boolean
  isLast: boolean
  timing?: StopTiming
}) {
  const cat = STOP_CATS[stop.category] ?? STOP_CATS.other
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const scheduled = stop.day !== null

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  return (
    <div className={`stop ${stop.done ? 'done' : ''} ${scheduled ? '' : 'saved-stop'}`}>
      {scheduled ? (
        <button className="stop-badge" style={{ background: dayColor(stop.day) }} onClick={() => toggleDone(stop, all)} title={stop.done ? 'Done! Tap to undo' : 'Tap when you’ve been here'} aria-label={stop.done ? 'Mark as not done' : 'Mark as done'}>
          {stop.done ? '✓' : index + 1}
        </button>
      ) : (
        <div className="stop-badge cat">{cat.icon}</div>
      )}
      <button className="stop-main" onClick={() => onEdit(stop)}>
        {timing && (timing.arrive !== null || timing.leave !== null) && (
          <div className="stop-clock">
            {timing.arrive !== null && <span className="clock-in">{fmtClock(timing.arrive)}</span>}
            {timing.arrive !== null && timing.leave !== null && timing.leave !== timing.arrive && <span className="clock-arrow">→</span>}
            {timing.leave !== null && (timing.arrive === null || timing.leave !== timing.arrive) && <span className="clock-out">{timing.arrive === null ? `Set off ${fmtClock(timing.leave)}` : fmtClock(timing.leave)}</span>}
            {stop.time && <span className="tag">🔒 booked {stop.time}</span>}
            {timing.late > 0 && <span className="tag late">⚠ {fmtDuration(timing.late)} late</span>}
          </div>
        )}
        {!timing && stop.time && <div className="stop-clock"><span className="clock-in">{stop.time}</span></div>}
        <div className="stop-name">{scheduled && <span className="cat-icon">{cat.icon}</span>}{stop.name}</div>
        {(stop.notes || stop.address) && <div className="stop-sub">{stop.notes || stop.address}</div>}
        {(stop.cost > 0 || stop.booking || stop.lat === null) && (
          <div className="stop-tags">
            {stop.cost > 0 && <span className="tag">{money(stop.cost, trip.currency)}</span>}
            {stop.booking && <span className="tag">🎫 {stop.booking}</span>}
            {stop.lat === null && <span className="tag warn">no map pin</span>}
          </div>
        )}
      </button>
      <div className="stop-actions no-print">
        {timing && timing.arrive !== null && <DurationSelect compact value={stop.duration ?? 0} onChange={(m) => db.stops.update(stop.id, { duration: m })} />}
        {!scheduled && (
          <label className="plan-it" title="Put it on a day">
            📅
            <DaySelect trip={trip} value={null} onChange={(d) => moveStopToDay(stop, d, all)} savedLabel="Add to day…" />
          </label>
        )}
        <div className="menu-wrap" ref={menuRef}>
          <button className="icon-btn sm more" onClick={() => setMenu((m) => !m)} aria-label="More options">⋯</button>
          {menu && (
            <div className="menu small-menu">
              <button onClick={() => { setMenu(false); onEdit(stop) }}>✏️ Edit details</button>
              {!isFirst && <button onClick={() => { setMenu(false); nudge(stop, -1, all) }}>⬆️ Move up</button>}
              {!isLast && <button onClick={() => { setMenu(false); nudge(stop, 1, all) }}>⬇️ Move down</button>}
              <label className="menu-select">📅 Move to
                <DaySelect trip={trip} value={stop.day} onChange={(d) => { setMenu(false); moveStopToDay(stop, d, all) }} savedLabel="⭐ Saved list" />
              </label>
              <button onClick={() => { setMenu(false); duplicateStop(stop) }}>📄 Duplicate</button>
              <button className="danger" onClick={() => { setMenu(false); if (confirm(`Remove “${stop.name}”?`)) db.stops.delete(stop.id) }}>🗑️ Remove</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
