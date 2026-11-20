import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useState } from 'react'
import { db, type Stop, type Trip } from '../db'
import { saveOrder, stopsForDay } from '../actions'
import { addDays, dayColor, dayCount, fmtDate, fmtDistance, hasCoords, haversine, money, optimiseRoute, routeLength, toISODate, travelHint } from '../utils'
import StopRow from './StopRow'
import AddStop from './AddStop'

export default function Itinerary({ trip, stops, onEdit, focusDay, setFocusDay }: {
  trip: Trip
  stops: Stop[]
  onEdit: (s: Stop) => void
  focusDay: number | 'all'
  setFocusDay: (d: number | 'all') => void
}) {
  const n = dayCount(trip.startDate, trip.endDate)
  const metas = useLiveQuery(() => db.days.where('tripId').equals(trip.id).toArray(), [trip.id]) ?? []
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const [flash, setFlash] = useState('')
  const today = toISODate(new Date())
  const saved = stops.filter((s) => s.day === null).length

  function jump(d: number | 'all') {
    setFocusDay(d)
    if (d !== 'all') document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function setMeta(day: number, patch: { title?: string; notes?: string }) {
    const id = `${trip.id}:${day}`
    const cur = await db.days.get(id)
    await db.days.put({ id, tripId: trip.id, day, title: '', notes: '', ...cur, ...patch })
  }

  async function sortByTime(day: number) {
    const list = stopsForDay(stops, day)
    const timed = list.filter((s) => s.time).sort((a, b) => a.time.localeCompare(b.time))
    // Untimed stops keep their relative position after the timed ones they followed.
    const result: Stop[] = []
    let ti = 0
    for (const s of list) result.push(s.time ? timed[ti++] : s)
    await saveOrder(result, day)
  }

  async function optimise(day: number) {
    const list = stopsForDay(stops, day)
    const before = routeLength(list)
    const next = optimiseRoute(list)
    const after = routeLength(next)
    if (before - after < 0.05) return setFlash(`Day ${day + 1} is already in a sensible order.`)
    await saveOrder(next, day)
    setFlash(`Day ${day + 1} reordered: ${fmtDistance(before)} → ${fmtDistance(after)} (first stop kept).`)
  }

  return (
    <div className="itinerary">
      <div className="day-chips no-print">
        <button className={`chip ${focusDay === 'all' ? 'on' : ''}`} onClick={() => jump('all')}>All days</button>
        {Array.from({ length: n }, (_, d) => (
          <button key={d} className={`chip ${focusDay === d ? 'on' : ''}`} style={{ '--c': dayColor(d) } as React.CSSProperties} onClick={() => jump(d)}>
            <i style={{ background: dayColor(d) }} />{trip.startDate ? fmtDate(addDays(trip.startDate, d), { weekday: 'short', day: 'numeric' }) : `Day ${d + 1}`}
          </button>
        ))}
      </div>
      {flash && <div className="notice no-print" onClick={() => setFlash('')}>{flash}</div>}
      {saved > 0 && (
        <a className="notice subtle no-print" href={`#/trip/${trip.id}/places`}>⭐ {saved} saved place{saved === 1 ? '' : 's'} not on a day yet. Open Saved to schedule them.</a>
      )}

      {Array.from({ length: n }, (_, d) => {
        const list = stopsForDay(stops, d)
        const meta = metas.find((m) => m.day === d)
        const date = trip.startDate ? addDays(trip.startDate, d) : ''
        const km = routeLength(list)
        const cost = list.reduce((t, s) => t + (s.cost || 0), 0)
        const isOpen = !collapsed[d]
        return (
          <section key={d} id={`day-${d}`} className={`day ${date === today ? 'today' : ''}`} onClick={() => focusDay !== d && setFocusDay(d)}>
            <header className="day-head">
              <button className="day-toggle" onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [d]: !c[d] })) }} aria-label={isOpen ? 'Collapse day' : 'Expand day'}>
                <span className="day-dot" style={{ background: dayColor(d) }} />
                <span className="caret">{isOpen ? '▾' : '▸'}</span>
              </button>
              <div className="day-titles">
                <div className="day-date">
                  {date ? fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' }) : `Day ${d + 1}`}
                  <span className="muted small"> · Day {d + 1}{date === today ? ' · Today' : ''}</span>
                </div>
                <input className="day-title-input" placeholder="Add a title (e.g. Old town & food tour)" defaultValue={meta?.title ?? ''} key={meta?.title ?? 'empty'} onBlur={(e) => e.target.value !== (meta?.title ?? '') && setMeta(d, { title: e.target.value })} onClick={(e) => e.stopPropagation()} />
              </div>
              <div className="day-stats muted small">
                {list.length > 0 && <span>{list.length} stop{list.length === 1 ? '' : 's'}</span>}
                {km > 0 && <span>{fmtDistance(km)}</span>}
                {cost > 0 && <span>{money(cost, trip.currency)}</span>}
              </div>
            </header>
            {isOpen && (
              <div className="day-body">
                {list.length > 1 && (
                  <div className="day-tools no-print">
                    <button className="btn tiny ghost" onClick={() => sortByTime(d)}>⏱ Sort by time</button>
                    {list.filter(hasCoords).length >= 3 && <button className="btn tiny ghost" onClick={() => optimise(d)}>✨ Optimise route</button>}
                  </div>
                )}
                {list.length === 0 && <p className="muted small pad-s">Nothing planned yet.</p>}
                {list.map((s, i) => {
                  const next = list[i + 1]
                  const leg = next && hasCoords(s) && hasCoords(next) ? haversine(s, next) : null
                  return (
                    <Fragment key={s.id}>
                      <StopRow stop={s} index={i} trip={trip} all={stops} onEdit={onEdit} isFirst={i === 0} isLast={i === list.length - 1} />
                      {leg !== null && <div className="leg muted small">↓ {fmtDistance(leg)} · {travelHint(leg)}</div>}
                    </Fragment>
                  )
                })}
                <AddStop trip={trip} day={d} stops={stops} placeholder={`Add a place to day ${d + 1}…`} />
                <textarea className="day-notes" placeholder="Notes for this day" defaultValue={meta?.notes ?? ''} key={`n-${meta?.notes ?? ''}`} onBlur={(e) => e.target.value !== (meta?.notes ?? '') && setMeta(d, { notes: e.target.value })} rows={meta?.notes ? 3 : 1} />
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
