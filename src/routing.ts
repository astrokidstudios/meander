import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { db, type RouteLeg, type Stop, type TravelMode } from './db'
import { hasCoords, haversine } from './utils'
import { useOnline } from './hooks'

/**
 * Real road routes from the free OpenStreetMap router run by FOSSGIS (routing.openstreetmap.de).
 * Each leg (stop → next stop, per travel profile) is fetched once, saved in IndexedDB, and reused
 * offline. Requests go one at a time with a pause between them to respect the service's fair use.
 */
type Profile = 'car' | 'foot' | 'bike'

export function profileFor(mode: TravelMode, km: number): Profile {
  if (mode === 'walk') return 'foot'
  if (mode === 'cycle') return 'bike'
  if (mode === 'auto') return km < 1.5 ? 'foot' : 'car'
  return 'car' // drive, and transit (no free transit router: car route, slower time)
}

const r5 = (n: number) => n.toFixed(5)
export const legKey = (p: Profile, a: { lat: number; lng: number }, b: { lat: number; lng: number }) => `${p}|${r5(a.lat)},${r5(a.lng)}|${r5(b.lat)},${r5(b.lng)}`

const STALE_MS = 1000 * 60 * 60 * 24 * 30 // refresh routes older than a month when online
const queue = new Map<string, { p: Profile; a: { lat: number; lng: number }; b: { lat: number; lng: number } }>()
const failedAt = new Map<string, number>()
let running = false

/** Keep the line light: drop points closer than ~25 m to the last kept one. */
function thin(coords: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const [lng, lat] of coords) {
    const last = out[out.length - 1]
    if (!last || Math.abs(last[0] - lat) > 0.00022 || Math.abs(last[1] - lng) > 0.00022) out.push([+lat.toFixed(5), +lng.toFixed(5)])
  }
  const end = coords[coords.length - 1]
  if (end) out.push([+end[1].toFixed(5), +end[0].toFixed(5)])
  return out
}

async function pump() {
  if (running) return
  running = true
  try {
    while (queue.size && navigator.onLine) {
      const [key, job] = queue.entries().next().value!
      queue.delete(key)
      try {
        const url = `https://routing.openstreetmap.de/routed-${job.p}/route/v1/driving/${job.a.lng},${job.a.lat};${job.b.lng},${job.b.lat}?overview=full&geometries=geojson`
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        const r = data.routes?.[0]
        if (data.code !== 'Ok' || !r) throw new Error(data.code || 'no route')
        await db.routes.put({ key, mins: Math.max(1, Math.round(r.duration / 60)), km: r.distance / 1000, geom: thin(r.geometry.coordinates), fetchedAt: Date.now() })
        failedAt.delete(key)
      } catch {
        failedAt.set(key, Date.now())
      }
      await new Promise((ok) => setTimeout(ok, 350))
    }
  } finally {
    running = false
  }
}

export interface DayLegs {
  /** Road leg arriving at stop index i (from stop i-1). */
  legs: Map<number, RouteLeg>
  /** True while some legs of this day are still being fetched. */
  loading: boolean
}

/** Road routes for several days at once (one hook call, so it can sit above a list of days). */
export function useRoadLegs(days: { stops: Stop[]; mode: TravelMode }[], priorityDay?: number | 'all' | 'saved'): DayLegs[] {
  const online = useOnline()
  const specs = days.map((d) =>
    d.stops.slice(1).flatMap((b, j) => {
      const a = d.stops[j]
      if (!hasCoords(a) || !hasCoords(b)) return []
      const p = profileFor(d.mode, haversine(a, b))
      return [{ i: j + 1, key: legKey(p, a, b), p, a: { lat: a.lat, lng: a.lng }, b: { lat: b.lat, lng: b.lng } }]
    }),
  )
  const keys = [...new Set(specs.flat().map((s) => s.key))]
  const sig = keys.join('#')
  const rows = useLiveQuery(() => db.routes.bulkGet(keys), [sig])
  const byKey = new Map<string, RouteLeg>()
  rows?.forEach((r) => r && byKey.set(r.key, r))

  useEffect(() => {
    if (!online || !rows) return
    let added = false
    // The day you're looking at goes to the front of the queue.
    const ordered = typeof priorityDay === 'number' && specs[priorityDay] ? [...specs[priorityDay], ...specs.flat()] : specs.flat()
    const urgent: typeof queue = new Map()
    for (const s of ordered) {
      const have = byKey.get(s.key)
      const recentFail = Date.now() - (failedAt.get(s.key) ?? 0) < 10 * 60 * 1000
      if ((!have || Date.now() - have.fetchedAt > STALE_MS) && !recentFail && !queue.has(s.key)) {
        urgent.set(s.key, { p: s.p, a: s.a, b: s.b })
        added = true
      }
    }
    if (added) {
      const rest = [...queue.entries()].filter(([k]) => !urgent.has(k))
      queue.clear()
      for (const [k, v] of [...urgent.entries(), ...rest]) queue.set(k, v)
      pump()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, online, rows, priorityDay])

  return specs.map((list, di) => {
    const legs = new Map<number, RouteLeg>()
    for (const s of list) {
      const r = byKey.get(s.key)
      if (r) legs.set(s.i, adjustForMode(r, days[di].mode))
    }
    return { legs, loading: online && list.some((s) => !byKey.has(s.key) && !failedAt.has(s.key)) }
  })
}

/** Public transport has no free router: use the road route but allow for slower buses and waiting. */
function adjustForMode(r: RouteLeg, mode: TravelMode): RouteLeg {
  return mode === 'transit' ? { ...r, mins: Math.round(r.mins * 1.5 + 8) } : r
}
