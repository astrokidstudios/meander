import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db, exportData, importData, type Trip } from '../db'
import { daysUntil, downloadJSON, fmtRange, toISODate } from '../utils'
import { go } from '../App'
import Logo from './Logo'
import TripForm from './TripForm'
import { CalendarDays, Check, Download, Globe, Luggage, MapPin, Plus, Sparkles, Upload } from 'lucide-react'
import { Ico, TripIcon } from '../icons'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Late-night planning?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function countdown(t: Trip, today: string) {
  const until = daysUntil(t.startDate)
  if (until === null) return null
  if (t.endDate && t.endDate < today) return { big: '', kind: 'past' as const, small: 'been there' }
  if (until <= 0) return { big: '', kind: 'now' as const, small: 'on it now!' }
  if (until === 1) return { big: '1', kind: 'soon' as const, small: 'day to go!' }
  return { big: String(until), kind: 'soon' as const, small: 'days to go' }
}

function TripCard({ t, places, today }: { t: Trip; places: number; today: string }) {
  const c = countdown(t, today)
  const past = t.endDate && t.endDate < today
  return (
    <button className={`trip-card ${past ? 'past' : ''}`} style={{ '--trip': t.color } as React.CSSProperties} onClick={() => go(`/trip/${t.id}/plan`)}>
      <div className="trip-card-band">
        <span className="trip-emoji"><TripIcon value={t.emoji} size={56} /></span>
        {c && <div className="countdown"><b>{c.kind === 'past' ? <Check size={22} strokeWidth={3} /> : c.kind === 'now' ? <Luggage size={22} /> : c.big}</b><small>{c.small}</small></div>}
      </div>
      <div className="trip-card-body">
        <div className="trip-card-name">{t.name}</div>
        <div className="trip-card-meta">
          <span><Ico as={CalendarDays} size={14} /> {fmtRange(t.startDate, t.endDate)}</span>
          <span><Ico as={MapPin} size={14} /> {places}</span>
        </div>
      </div>
    </button>
  )
}

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
  const next = upcoming[0]

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
          <Logo size={42} />
          <span className="wordmark">meander</span>
        </div>
        <div className="row gap">
          <button className="btn ghost small" onClick={() => fileRef.current?.click()} title="Import a backup file"><Ico as={Upload} size={15} /> Import</button>
          <button className="btn ghost small" disabled={!trips?.length} title="Save all trips to a file" onClick={async () => downloadJSON(await exportData(), `meander-backup-${today}.json`)}><Ico as={Download} size={15} /> Back up</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </div>
      </header>

      <div className="hello">
        <p className="hello-small">{greeting()}</p>
        <h1>{next ? <>Next stop: <span className="hl" style={{ '--trip': next.color } as React.CSSProperties}>{next.destination || next.name}</span></> : 'Where are we off to?'}</h1>
      </div>
      {msg && <div className="notice pop" onClick={() => setMsg('')}>{msg}</div>}

      {trips && trips.length === 0 ? (
        <div className="empty-hero">
          <div className="globe"><Globe size={64} strokeWidth={1.5} /></div>
          <h2>Your adventures start here</h2>
          <p className="muted">Make a trip, collect places you love, and Meander lays out your days, times and route. It all saves on this device, so it works on a plane too.</p>
          <button className="btn primary lg" onClick={() => setCreating(true)}><Ico as={Sparkles} size={18} /> Plan my first trip</button>
        </div>
      ) : (
        <>
          <div className="trip-grid">
            {upcoming.map((t) => <TripCard key={t.id} t={t} places={stopCounts?.[t.id] ?? 0} today={today} />)}
            <button className="trip-card new-card" onClick={() => setCreating(true)}>
              <span className="plus"><Plus size={32} /></span>
              <span>New trip</span>
            </button>
          </div>
          {past.length > 0 && (
            <>
              <h3 className="section-title">Memories</h3>
              <div className="trip-grid">
                {past.map((t) => <TripCard key={t.id} t={t} places={stopCounts?.[t.id] ?? 0} today={today} />)}
              </div>
            </>
          )}
        </>
      )}

      {creating && <TripForm onClose={() => setCreating(false)} onSaved={(id) => go(`/trip/${id}/plan`)} />}
    </div>
  )
}
