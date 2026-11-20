import Dexie, { type EntityTable } from 'dexie'

export interface Trip {
  id: string
  name: string
  destination: string
  startDate: string // YYYY-MM-DD
  endDate: string
  currency: string
  budget: number
  travelers: number
  color: string
  emoji?: string
  notes: string
  createdAt: number
  updatedAt: number
}

export type StopCategory =
  | 'sight'
  | 'food'
  | 'stay'
  | 'transport'
  | 'activity'
  | 'shopping'
  | 'other'

/** A place on the trip. day === null means "saved for later", otherwise it is on that day (0-based). */
export interface Stop {
  id: string
  tripId: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  category: StopCategory
  day: number | null
  order: number
  time: string // HH:MM or ''
  endTime: string
  cost: number
  booking: string // confirmation number / reference
  url: string
  notes: string
  done: boolean
  createdAt: number
  /** Minutes spent at this place. */
  duration?: number
  /** Manual travel time (minutes) from the previous stop; null/undefined = estimate it. */
  travelMins?: number | null
}

export interface DayMeta {
  id: string // `${tripId}:${day}`
  tripId: string
  day: number
  title: string
  notes: string
  /** Departure time from the first stop, HH:MM. */
  startTime?: string
  mode?: TravelMode
}

export type TravelMode = 'auto' | 'walk' | 'drive' | 'transit' | 'cycle'

export type ExpenseCategory =
  | 'stay'
  | 'transport'
  | 'food'
  | 'activities'
  | 'shopping'
  | 'other'

export interface Expense {
  id: string
  tripId: string
  title: string
  amount: number
  category: ExpenseCategory
  date: string
  paidBy: string
  createdAt: number
}

export interface CheckItem {
  id: string
  tripId: string
  list: 'packing' | 'todo'
  text: string
  done: boolean
  order: number
}

export const db = new Dexie('meander') as Dexie & {
  trips: EntityTable<Trip, 'id'>
  stops: EntityTable<Stop, 'id'>
  days: EntityTable<DayMeta, 'id'>
  expenses: EntityTable<Expense, 'id'>
  checks: EntityTable<CheckItem, 'id'>
}

db.version(1).stores({
  trips: 'id, startDate, updatedAt',
  stops: 'id, tripId, [tripId+day]',
  days: 'id, tripId',
  expenses: 'id, tripId',
  checks: 'id, tripId',
})

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36))

export async function touchTrip(tripId: string) {
  await db.trips.update(tripId, { updatedAt: Date.now() })
}

export async function deleteTrip(tripId: string) {
  await db.transaction('rw', [db.trips, db.stops, db.days, db.expenses, db.checks], async () => {
    await db.stops.where('tripId').equals(tripId).delete()
    await db.days.where('tripId').equals(tripId).delete()
    await db.expenses.where('tripId').equals(tripId).delete()
    await db.checks.where('tripId').equals(tripId).delete()
    await db.trips.delete(tripId)
  })
}

export interface TripBundle {
  app: 'meander'
  version: 1
  exportedAt: string
  trips: Trip[]
  stops: Stop[]
  days: DayMeta[]
  expenses: Expense[]
  checks: CheckItem[]
}

export async function exportData(tripId?: string): Promise<TripBundle> {
  const by = <T extends { tripId: string }>(rows: T[]) =>
    tripId ? rows.filter((r) => r.tripId === tripId) : rows
  const trips = await db.trips.toArray()
  return {
    app: 'meander',
    version: 1,
    exportedAt: new Date().toISOString(),
    trips: tripId ? trips.filter((t) => t.id === tripId) : trips,
    stops: by(await db.stops.toArray()),
    days: by(await db.days.toArray()),
    expenses: by(await db.expenses.toArray()),
    checks: by(await db.checks.toArray()),
  }
}

/** Imports a backup. Existing records with the same id are overwritten (so re-importing is safe). */
export async function importData(bundle: TripBundle) {
  if (bundle?.app !== 'meander' || !Array.isArray(bundle.trips)) {
    throw new Error('This file is not a Meander backup.')
  }
  await db.transaction('rw', [db.trips, db.stops, db.days, db.expenses, db.checks], async () => {
    await db.trips.bulkPut(bundle.trips)
    await db.stops.bulkPut(bundle.stops ?? [])
    await db.days.bulkPut(bundle.days ?? [])
    await db.expenses.bulkPut(bundle.expenses ?? [])
    await db.checks.bulkPut(bundle.checks ?? [])
  })
  return bundle.trips.length
}
