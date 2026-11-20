import { useState } from 'react'
import { db, uid, type Trip } from '../db'
import { addDays, CURRENCIES, dayCount, toISODate, TRIP_COLORS } from '../utils'
import Modal from './Modal'

export default function TripForm({ trip, onClose, onSaved }: { trip?: Trip; onClose: () => void; onSaved?: (id: string) => void }) {
  const start = toISODate(new Date(Date.now() + 14 * 86400000))
  const [f, setF] = useState({
    name: trip?.name ?? '',
    destination: trip?.destination ?? '',
    startDate: trip?.startDate ?? start,
    endDate: trip?.endDate ?? addDays(start, 4),
    currency: trip?.currency ?? 'GBP',
    budget: trip?.budget ?? 0,
    travelers: trip?.travelers ?? 1,
    color: trip?.color ?? TRIP_COLORS[Math.floor(Math.random() * TRIP_COLORS.length)],
  })
  const [error, setError] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  async function save() {
    if (!f.name.trim() && !f.destination.trim()) return setError('Give the trip a name or destination.')
    if (f.endDate < f.startDate) return setError('The end date is before the start date.')
    const name = f.name.trim() || `Trip to ${f.destination.trim()}`
    if (trip) {
      const newDays = dayCount(f.startDate, f.endDate)
      const oldDays = dayCount(trip.startDate, trip.endDate)
      if (newDays < oldDays) {
        // Stops on days that no longer exist go back to the saved list rather than vanishing.
        const orphans = await db.stops.where('tripId').equals(trip.id).filter((s) => s.day !== null && s.day >= newDays).toArray()
        if (orphans.length && !confirm(`${orphans.length} place(s) are on days that will be removed. Move them back to Saved places?`)) return
        await Promise.all(orphans.map((s) => db.stops.update(s.id, { day: null })))
      }
      await db.trips.update(trip.id, { ...f, name, updatedAt: Date.now() })
      onSaved?.(trip.id)
    } else {
      const id = uid()
      await db.trips.add({ id, ...f, name, notes: '', createdAt: Date.now(), updatedAt: Date.now() })
      onSaved?.(id)
    }
    onClose()
  }

  return (
    <Modal
      title={trip ? 'Edit trip' : 'New trip'}
      onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>{trip ? 'Save' : 'Create trip'}</button></>}
    >
      <form className="form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label>Destination<input autoFocus value={f.destination} onChange={(e) => set('destination', e.target.value)} placeholder="e.g. Lisbon, Portugal" /></label>
        <label>Trip name<input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={f.destination ? `Trip to ${f.destination}` : 'e.g. Summer in Portugal'} /></label>
        <div className="grid2">
          <label>Start<input type="date" value={f.startDate} onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, startDate: v, endDate: p.endDate < v ? v : p.endDate })) }} /></label>
          <label>End<input type="date" value={f.endDate} min={f.startDate} onChange={(e) => set('endDate', e.target.value)} /></label>
        </div>
        <div className="grid3">
          <label>Currency<select value={f.currency} onChange={(e) => set('currency', e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Budget<input type="number" min={0} inputMode="decimal" value={f.budget || ''} onChange={(e) => set('budget', Number(e.target.value))} placeholder="0" /></label>
          <label>Travellers<input type="number" min={1} value={f.travelers} onChange={(e) => set('travelers', Math.max(1, Number(e.target.value)))} /></label>
        </div>
        <div className="field">
          <span>Colour</span>
          <div className="swatches">
            {TRIP_COLORS.map((c) => (
              <button type="button" key={c} className={`swatch ${f.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => set('color', c)} aria-label={`Colour ${c}`} />
            ))}
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
