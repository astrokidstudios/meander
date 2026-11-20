import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useState } from 'react'
import { db, type DayMeta, type Stop, type TravelMode, type Trip } from '../db'
import { saveOrder, stopsForDay } from '../actions'
import { addDays, buildTimeline, dayColor, dayCount, fmtClock, fmtDate, fmtDistance, fmtDuration, googleRouteUrl, hasCoords, money, optimiseRoute, routeLength, toISODate, TRAVEL_MODES, type StopTiming } from '../utils'
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

  async function setMeta(day: number, patch: Partial<Pick<DayMeta, 'title' | 'notes' | 'startTime' | 'mode'>>) {
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
        const mode: TravelMode = meta?.mode ?? 'auto'
        const timeline = buildTimeline(list, meta?.startTime, mode)
        const lastT = timeline[timeline.length - 1]
        const lastLeave = lastT ? lastT.leave ?? lastT.arrive : null
        const routeUrl = googleRouteUrl(list, mode)
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
                {lastLeave !== null && list.length > 1 && <span>ends ~{fmtClock(lastLeave)}</span>}
              </div>
            </header>
            {isOpen && (
              <div className="day-body">
                <div className="day-plan-bar">
                  <label>🕘 Set off at <input type="time" value={meta?.startTime ?? ''} onChange={(e) => setMeta(d, { startTime: e.target.value })} /></label>
                  <label>Getting around
                    <select value={mode} onChange={(e) => setMeta(d, { mode: e.target.value as TravelMode })}>
                      {(Object.keys(TRAVEL_MODES) as TravelMode[]).map((m) => <option key={m} value={m}>{TRAVEL_MODES[m].icon} {TRAVEL_MODES[m].label}</option>)}
                    </select>
                  </label>
                </div>
                {list.length > 1 && (
                  <div className="day-tools no-print">
                    <button className="btn tiny ghost" onClick={() => sortByTime(d)}>⏱ Sort by fixed times</button>
                    {list.filter(hasCoords).length >= 3 && <button className="btn tiny ghost" onClick={() => optimise(d)}>✨ Optimise route</button>}
                    {routeUrl && <a className="btn tiny ghost" href={routeUrl} target="_blank" rel="noreferrer">🗺️ Open day in Google Maps</a>}
                  </div>
                )}
                {list.length === 0 && <p className="muted small pad-s">Nothing planned yet.</p>}
                {list.map((s, i) => (
                  <Fragment key={s.id}>
                    {i > 0 && <Leg stop={s} timing={timeline[i]} />}
                    <StopRow stop={s} index={i} trip={trip} all={stops} onEdit={onEdit} isFirst={i === 0} isLast={i === list.length - 1} timing={timeline[i]} />
                  </Fragment>
                ))}
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

/** The gap between two stops: travel time (estimated or set by you), distance, and any free time. */
function Leg({ stop, timing }: { stop: Stop; timing: StopTiming }) {
  const edit = () => {
    const v = prompt('Travel time to this stop, in minutes (leave empty to estimate it automatically):', timing.travelManual ? String(stop.travelMins) : '')
    if (v === null) return
    const n = parseInt(v, 10)
    db.stops.update(stop.id, { travelMins: v.trim() === '' || Number.isNaN(n) ? null : Math.max(0, n) })
  }
  const icon = timing.travelMode ? TRAVEL_MODES[timing.travelMode].icon : '↓'
  return (
    <div className="leg muted small">
      <button className="leg-btn" onClick={edit} title="Change travel time">
        {icon} {timing.travel !== null ? fmtDuration(timing.travel) : 'travel time?'}
        {timing.km !== null && ` · ${fmtDistance(timing.km)}`}
        {timing.travelManual ? ' · set by you' : timing.travel !== null ? ' · est.' : ''} ✎
      </button>
      {timing.wait > 0 && <span className="free"> · {fmtDuration(timing.wait)} free time</span>}
    </div>
  )
}
