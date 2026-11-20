import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db, exportData, importData } from '../db'
import { daysUntil, downloadJSON, fmtRange, toISODate } from '../utils'
import { go } from '../App'
import Logo from './Logo'
import TripForm from './TripForm'

export default function TripList() {
  const trips = useLiveQuery(() => db.trips.orderBy('startDate').toArray(), [])
  const stopCounts = useLiveQuery(async () => {
    const map: Record<string, number> = {}
    await db.stops.each((s) => (map[s.tripId] = (map[s.tripId] ?? 0) + 1))
    return map
  }, [])
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const today = toISODate(new Date())
  const upcoming = (trips ?? []).filter((t) => !t.endDate || t.endDate >= today)
  const past = (trips ?? []).filter((t) => t.endDate && t.endDate < today).reverse()

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const n = await importData(JSON.parse(await file.text()))
      setMsg(`Imported ${n} trip${n === 1 ? '' : 's'}.`)
    } catch (err) {
      setMsg((err as Error).message || 'Could not read that file.')
    }
  }

  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">
          <Logo size={40} />
          <div>
            <h1>Meander</h1>
            <p className="muted">Plan trips day by day. Works offline.</p>
          </div>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import</button>
          <button
            className="btn ghost"
            disabled={!trips?.length}
            onClick={async () => downloadJSON(await exportData(), `meander-backup-${today}.json`)}
          >
            Back up all
          </button>
          <button className="btn primary" onClick={() => setCreating(true)}>+ New trip</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </div>
      </header>
      {msg && <div className="notice" onClick={() => setMsg('')}>{msg}</div>}

      {trips && trips.length === 0 && (
        <div className="empty-hero">
          <Logo size={72} />
          <h2>Where to next?</h2>
          <p className="muted">Create a trip, add the places you want to see, then put them into days. Everything is saved on this device, so it works on a plane.</p>
          <button className="btn primary lg" onClick={() => setCreating(true)}>Plan a trip</button>
        </div>
      )}

      {upcoming.length > 0 && <h3 className="section-title">Upcoming</h3>}
      <div className="trip-grid">
        {upcoming.map((t) => {
          const until = daysUntil(t.startDate)
          return (
            <button key={t.id} className="trip-card" style={{ '--trip': t.color } as React.CSSProperties} onClick={() => go(`/trip/${t.id}/plan`)}>
              <div className="trip-card-band" />
              <div className="trip-card-body">
                <div className="trip-card-name">{t.name}</div>
                <div className="muted">{t.destination || 'No destination yet'}</div>
                <div className="trip-card-meta">
                  <span>{fmtRange(t.startDate, t.endDate)}</span>
                  <span>{stopCounts?.[t.id] ?? 0} places</span>
                </div>
                {until !== null && until > 0 && <div className="pill">in {until} day{until === 1 ? '' : 's'}</div>}
                {until !== null && until <= 0 && t.endDate >= today && <div className="pill live">On the trip now</div>}
              </div>
            </button>
          )
        })}
      </div>

      {past.length > 0 && <h3 className="section-title">Past trips</h3>}
      <div className="trip-grid">
        {past.map((t) => (
          <button key={t.id} className="trip-card past" style={{ '--trip': t.color } as React.CSSProperties} onClick={() => go(`/trip/${t.id}/plan`)}>
            <div className="trip-card-band" />
            <div className="trip-card-body">
              <div className="trip-card-name">{t.name}</div>
              <div className="muted">{t.destination}</div>
              <div className="trip-card-meta"><span>{fmtRange(t.startDate, t.endDate)}</span></div>
            </div>
          </button>
        ))}
      </div>

      {creating && <TripForm onClose={() => setCreating(false)} onSaved={(id) => go(`/trip/${id}/plan`)} />}
    </div>
  )
}
