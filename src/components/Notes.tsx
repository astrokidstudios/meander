import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db, uid, type CheckItem, type Trip } from '../db'

const PACKING_STARTER = ['Passport / ID', 'Phone charger', 'Travel adapter', 'Medication', 'Toiletries', 'Bank card + some cash', 'Travel insurance details', 'Headphones']

function Checklist({ trip, list, title, starter }: { trip: Trip; list: CheckItem['list']; title: string; starter?: string[] }) {
  const items = useLiveQuery(() => db.checks.where('tripId').equals(trip.id).filter((c) => c.list === list).toArray(), [trip.id, list]) ?? []
  const [text, setText] = useState('')
  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order)
  const done = items.filter((i) => i.done).length

  async function add(t: string | string[]) {
    const texts = (Array.isArray(t) ? t : [t]).map((x) => x.trim()).filter(Boolean)
    const base = items.reduce((m, i) => Math.max(m, i.order), 0)
    await db.checks.bulkAdd(texts.map((x, i) => ({ id: uid(), tripId: trip.id, list, text: x, done: false, order: base + i + 1 })))
  }

  return (
    <div className="card">
      <div className="row between"><h3>{title}</h3>{items.length > 0 && <span className="muted small">{done}/{items.length}</span>}</div>
      <form className="add-row" onSubmit={(e) => { e.preventDefault(); add(text); setText('') }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an item" />
        <button className="btn small" disabled={!text.trim()}>Add</button>
      </form>
      {items.length === 0 && starter && <button className="btn tiny ghost" onClick={() => add(starter)}>Start with a basic packing list</button>}
      <ul className="checklist">
        {sorted.map((i) => (
          <li key={i.id} className={i.done ? 'done' : ''}>
            <label><input type="checkbox" checked={i.done} onChange={(e) => db.checks.update(i.id, { done: e.target.checked })} /> <span>{i.text}</span></label>
            <button className="icon-btn sm" aria-label="Remove" onClick={() => db.checks.delete(i.id)}>✕</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Notes({ trip }: { trip: Trip }) {
  const [notes, setNotes] = useState(trip.notes)
  const [saved, setSaved] = useState(true)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function onChange(v: string) {
    setNotes(v)
    setSaved(false)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      await db.trips.update(trip.id, { notes: v, updatedAt: Date.now() })
      setSaved(true)
    }, 500)
  }

  return (
    <div className="notes">
      <div className="card">
        <div className="row between"><h3>Trip notes</h3><span className="muted small">{saved ? 'Saved' : 'Saving…'}</span></div>
        <textarea className="notes-area" value={notes} onChange={(e) => onChange(e.target.value)} placeholder="Flights, hotel addresses, emergency numbers, phrases, ideas…" rows={10} />
      </div>
      <div className="grid-notes">
        <Checklist trip={trip} list="packing" title="Packing list" starter={PACKING_STARTER} />
        <Checklist trip={trip} list="todo" title="To do before we go" />
      </div>
    </div>
  )
}
