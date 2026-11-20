import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useState } from 'react'
import { db, type DayMeta, type Stop, type TravelMode, type Trip } from '../db'
import { saveOrder, stopsForDay } from '../actions'
import { addDays, buildTimeline, dayColor, dayCount, fmtClock, fmtDate, fmtDistance, fmtDuration, googleRouteUrl, hasCoords, money, optimiseRoute, routeLength, toISODate, TRAVEL_MODES, type StopTiming } from '../utils'
import StopRow from './StopRow'
import { useRoadLegs } from '../routing'
import AddStop from './AddStop'

const FREE_DAY_LINES = ['A free day! Add something below, or just wander. 🌤️', 'Nothing planned yet. Maybe a long lunch? 🍝', 'Blank page. Adventure goes here. 🧭']

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
  const dayInputs = Array.from({ length: n }, (_, d) => ({ stops: stopsForDay(stops, d), mode: (metas.find((m) => m.day === d)?.mode ?? 'auto') as TravelMode }))
  const road = useRoadLegs(dayInputs, focusDay)

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
    if (!timed.length) return setFlash('Give places a fixed time (in their details) to sort by it.')
    // Untimed stops keep their slots; timed ones are put in clock order.
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
    if (before - after < 0.05) return setFlash(`👌 Day ${day + 1} is already in a great order.`)
    await saveOrder(next, day)
    setFlash(`✨ Day ${day + 1} shuffled: ${fmtDistance(before)} → ${fmtDistance(after)} of travel (first stop kept).`)
  }

  return (
    <div className="itinerary">
      <div className="day-chips no-print">
        <button className={`chip ${focusDay === 'all' ? 'on' : ''}`} onClick={() => jump('all')}>All days</button>
        {Array.from({ length: n }, (_, d) => (
          <button key={d} className={`chip ${focusDay === d ? 'on' : ''}`} style={{ '--c': dayColor(d) } as React.CSSProperties} onClick={() => jump(d)}>
            <i />{trip.startDate ? fmtDate(addDays(trip.startDate, d), { weekday: 'short', day: 'numeric' }) : `Day ${d + 1}`}
          </button>
        ))}
      </div>
      {flash && <div className="notice pop no-print" onClick={() => setFlash('')}>{flash}</div>}
      {saved > 0 && (
        <a className="notice subtle no-print" href={`#/trip/${trip.id}/places`}>⭐ {saved} saved place{saved === 1 ? '' : 's'} waiting for a day. Tap to plan them in.</a>
      )}

      {Array.from({ length: n }, (_, d) => {
        const list = stopsForDay(stops, d)
        const meta = metas.find((m) => m.day === d)
        const date = trip.startDate ? addDays(trip.startDate, d) : ''
        const km = routeLength(list, road[d]?.legs)
        const cost = list.reduce((t, s) => t + (s.cost || 0), 0)
        const isOpen = !collapsed[d]
        const mode: TravelMode = meta?.mode ?? 'auto'
        const timeline = buildTimeline(list, meta?.startTime, mode, road[d]?.legs)
        const lastT = timeline[timeline.length - 1]
        const lastLeave = lastT ? lastT.leave ?? lastT.arrive : null
        const routeUrl = googleRouteUrl(list, mode)
        const done = list.filter((s) => s.done).length
        const allDone = list.length > 0 && done === list.length
        const stats = [
          list.length ? `${list.length} stop${list.length === 1 ? '' : 's'}` : '',
          km > 0 ? fmtDistance(km) : '',
          cost > 0 ? money(cost, trip.currency) : '',
          lastLeave !== null && list.length > 1 ? `done by ${fmtClock(lastLeave)}` : '',
        ].filter(Boolean)
        return (
          <section key={d} id={`day-${d}`} className={`day ${date === today ? 'today' : ''} ${allDone ? 'all-done' : ''}`} style={{ '--day': dayColor(d) } as React.CSSProperties} onClick={() => focusDay !== d && setFocusDay(d)}>
            <header className="day-head" onClick={() => setCollapsed((c) => ({ ...c, [d]: !c[d] }))}>
              <div className="date-bubble">
                {date ? (<><small>{fmtDate(date, { weekday: 'short' })}</small><b>{fmtDate(date, { day: 'numeric' })}</b></>) : <b>{d + 1}</b>}
              </div>
              <div className="day-titles">
                <div className="day-kicker">
                  Day {d + 1}{date ? ` · ${fmtDate(date, { month: 'long' })}` : ''}
                  {date === today && <span className="today-badge">Today</span>}
                  {allDone && <span className="done-badge">🎉 Done!</span>}
                </div>
                <input className="day-title-input" placeholder="Name this day ✏️" defaultValue={meta?.title ?? ''} key={meta?.title ?? 'empty'} onBlur={(e) => e.target.value !== (meta?.title ?? '') && setMeta(d, { title: e.target.value })} onClick={(e) => e.stopPropagation()} />
                {stats.length > 0 && <div className="day-stats">{stats.join(' · ')}</div>}
              </div>
              <span className={`caret ${isOpen ? 'open' : ''}`} aria-label={isOpen ? 'Collapse day' : 'Expand day'}>›</span>
            </header>
            {list.length > 0 && done > 0 && !allDone && <div className="day-progress"><div style={{ width: `${(done / list.length) * 100}%` }} /></div>}
            {isOpen && (
              <div className="day-body">
                <div className="day-plan-bar no-print">
                  <label className="pill-field" title="When you set off from the first stop">🕘<input type="time" value={meta?.startTime ?? ''} onChange={(e) => setMeta(d, { startTime: e.target.value })} aria-label="Set off at" /></label>
                  <label className="pill-field" title="How you get around (Auto walks short hops, drives longer ones)">
                    {TRAVEL_MODES[mode].icon}
                    <select value={mode} onChange={(e) => setMeta(d, { mode: e.target.value as TravelMode })} aria-label="Getting around">
                      {(Object.keys(TRAVEL_MODES) as TravelMode[]).map((m) => <option key={m} value={m}>{TRAVEL_MODES[m].label}</option>)}
                    </select>
                  </label>
                  {list.filter(hasCoords).length >= 3 && <button className="pill-btn" onClick={() => optimise(d)} title="Reorder for the shortest route">✨ Optimise</button>}
                  {list.some((s) => s.time) && <button className="pill-btn" onClick={() => sortByTime(d)} title="Put fixed-time bookings in clock order">⏱ Sort</button>}
                  {routeUrl && <a className="pill-btn" href={routeUrl} target="_blank" rel="noreferrer" title="Open the whole day as a route in Google Maps">🗺️ Google Maps</a>}
                </div>
                {!meta?.startTime && list.length > 1 && <div className="hint">Tip: set a time on 🕘 to see when you'll arrive and leave each place.</div>}
                {list.length === 0 && <p className="free-day">{FREE_DAY_LINES[d % FREE_DAY_LINES.length]}</p>}
                <div className="timeline">
                  {list.map((s, i) => (
                    <Fragment key={s.id}>
                      {i > 0 && <Leg stop={s} timing={timeline[i]} />}
                      <StopRow stop={s} index={i} trip={trip} all={stops} onEdit={onEdit} isFirst={i === 0} isLast={i === list.length - 1} timing={timeline[i]} />
                    </Fragment>
                  ))}
                </div>
                <AddStop trip={trip} day={d} stops={stops} placeholder="➕ Add a place…" />
                <textarea className="day-notes" placeholder="📝 Notes for the day" defaultValue={meta?.notes ?? ''} key={`n-${meta?.notes ?? ''}`} onBlur={(e) => e.target.value !== (meta?.notes ?? '') && setMeta(d, { notes: e.target.value })} rows={meta?.notes ? 3 : 1} />
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
  const icon = timing.travelMode ? TRAVEL_MODES[timing.travelMode].icon : '⋮'
  return (
    <div className="leg">
      <button className="leg-btn" onClick={edit} title="Tap to set the real travel time">
        <span className="leg-icon">{icon}</span>
        {timing.travel !== null ? fmtDuration(timing.travel) : 'travel time?'}
        {timing.km !== null && <span className="leg-km">{fmtDistance(timing.km)}</span>}
        {timing.travelManual && <span className="leg-km">✓ yours</span>}
        {!timing.travelManual && timing.travel !== null && <span className="leg-km">{timing.road ? '🛣️ by road' : 'est.'}</span>}
      </button>
      {timing.wait > 0 && <span className="free">☕ {fmtDuration(timing.wait)} free</span>}
    </div>
  )
}
