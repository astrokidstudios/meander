import { db, touchTrip, uid, type Stop, type StopCategory } from './db'

/** Sensible default time spent at a new place, in minutes (easy to change per stop). */
export const DEFAULT_STAY: Record<StopCategory, number> = { sight: 90, food: 60, stay: 0, transport: 0, activity: 120, shopping: 45, other: 30 }

export function sortStops(stops: Stop[]) {
  return [...stops].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

export function stopsForDay(stops: Stop[], day: number | null) {
  return sortStops(stops.filter((s) => s.day === day))
}

export async function addStop(tripId: string, day: number | null, data: Partial<Stop>) {
  const siblings = await db.stops.where('tripId').equals(tripId).filter((s) => s.day === day).toArray()
  const order = siblings.reduce((m, s) => Math.max(m, s.order), 0) + 1
  const stop: Stop = {
    id: uid(),
    tripId,
    name: 'New place',
    address: '',
    lat: null,
    lng: null,
    category: 'sight',
    day,
    order,
    time: '',
    endTime: '',
    cost: 0,
    booking: '',
    url: '',
    notes: '',
    done: false,
    createdAt: Date.now(),
    duration: DEFAULT_STAY[data.category ?? 'sight'],
    travelMins: null,
    ...data,
  }
  await db.stops.add(stop)
  await touchTrip(tripId)
  return stop
}

/** Writes a new order for a list of stops (all on the same day). */
export async function saveOrder(list: Stop[], day: number | null) {
  await db.transaction('rw', db.stops, async () => {
    await Promise.all(list.map((s, i) => db.stops.update(s.id, { order: i + 1, day })))
  })
  if (list[0]) await touchTrip(list[0].tripId)
}

export async function moveStopToDay(stop: Stop, day: number | null, allStops: Stop[]) {
  if (stop.day === day) return
  const target = stopsForDay(allStops, day).filter((s) => s.id !== stop.id)
  await saveOrder([...target, { ...stop, day }], day)
}

export async function nudge(stop: Stop, dir: -1 | 1, allStops: Stop[]) {
  const list = stopsForDay(allStops, stop.day)
  const i = list.findIndex((s) => s.id === stop.id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  await saveOrder(list, stop.day)
}

export async function duplicateStop(stop: Stop) {
  const { id: _id, ...rest } = stop
  void _id
  return addStop(stop.tripId, stop.day, { ...rest, name: `${stop.name} (copy)`, createdAt: Date.now() })
}
