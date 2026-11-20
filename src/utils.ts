import type { ExpenseCategory, Stop, StopCategory } from './db'

export const DAY_COLORS = [
  '#e4572e', '#17a398', '#f3a712', '#6a4c93', '#1982c4',
  '#8ac926', '#ff7aa2', '#3d405b', '#c44900', '#00a6a6',
]
export const dayColor = (day: number | null) =>
  day === null ? '#8a8f98' : DAY_COLORS[day % DAY_COLORS.length]

export const TRIP_COLORS = ['#17a398', '#e4572e', '#1982c4', '#6a4c93', '#f3a712', '#3d405b']

export const STOP_CATS: Record<StopCategory, { label: string; icon: string }> = {
  sight: { label: 'Sight', icon: '🏛️' },
  food: { label: 'Food & drink', icon: '🍜' },
  stay: { label: 'Stay', icon: '🛏️' },
  transport: { label: 'Transport', icon: '🚆' },
  activity: { label: 'Activity', icon: '🎟️' },
  shopping: { label: 'Shopping', icon: '🛍️' },
  other: { label: 'Other', icon: '📍' },
}

export const EXPENSE_CATS: Record<ExpenseCategory, { label: string; icon: string }> = {
  stay: { label: 'Accommodation', icon: '🛏️' },
  transport: { label: 'Transport', icon: '🚆' },
  food: { label: 'Food & drink', icon: '🍜' },
  activities: { label: 'Activities', icon: '🎟️' },
  shopping: { label: 'Shopping', icon: '🛍️' },
  other: { label: 'Other', icon: '💸' },
}

export const stopToExpenseCat = (c: StopCategory): ExpenseCategory =>
  c === 'sight' || c === 'activity' ? 'activities' : c === 'other' ? 'other' : c

/** Parse YYYY-MM-DD as a local date (not UTC). */
export function parseDate(s: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function toISODate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(s: string, n: number) {
  const d = parseDate(s)
  if (!d) return ''
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function dayCount(start: string, end: string) {
  const a = parseDate(start)
  const b = parseDate(end)
  if (!a || !b) return 1
  const n = Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  return Math.max(1, Math.min(n, 120))
}

export function fmtDate(s: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  const d = parseDate(s)
  return d ? d.toLocaleDateString(undefined, opts) : ''
}

export function fmtRange(start: string, end: string) {
  if (!start) return 'Dates not set'
  const a = parseDate(start)!
  const b = parseDate(end) ?? a
  const sameYear = a.getFullYear() === b.getFullYear()
  const left = a.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
  const right = b.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return start === end ? right : `${left} – ${right}`
}

export function daysUntil(start: string) {
  const d = parseDate(start)
  if (!d) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

export function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n || 0)
  } catch {
    return `${currency} ${(n || 0).toFixed(2)}`
  }
}

/** Great-circle distance in km. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const hasCoords = (s: Stop): s is Stop & { lat: number; lng: number } =>
  typeof s.lat === 'number' && typeof s.lng === 'number'

export function fmtDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`
}

/** Rough travel time: walk under 2 km, otherwise drive/transit at ~30 km/h average in-city. */
export function travelHint(km: number) {
  if (km < 2) {
    const mins = Math.max(1, Math.round((km / 4.8) * 60))
    return `${mins} min walk`
  }
  const mins = Math.round((km / 30) * 60)
  return mins < 60 ? `~${mins} min by car/transit` : `~${(mins / 60).toFixed(1)} h by car/transit`
}

/**
 * Reorders a day's stops to shorten the route: keeps the first stop fixed,
 * then nearest-neighbour, then 2-opt improvement. Stops without coordinates keep their place at the end.
 */
export function optimiseRoute(stops: Stop[]): Stop[] {
  const geo = stops.filter(hasCoords)
  const rest = stops.filter((s) => !hasCoords(s))
  if (geo.length < 3) return stops
  const route = [geo[0]]
  const left = geo.slice(1)
  while (left.length) {
    const last = route[route.length - 1]
    let best = 0
    for (let i = 1; i < left.length; i++) {
      if (haversine(last, left[i]) < haversine(last, left[best])) best = i
    }
    route.push(left.splice(best, 1)[0])
  }
  const len = (r: typeof route) => r.slice(1).reduce((t, s, i) => t + haversine(r[i], s), 0)
  let improved = true
  let guard = 0
  while (improved && guard++ < 50) {
    improved = false
    for (let i = 1; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const next = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)]
        if (len(next) + 1e-9 < len(route)) {
          route.splice(0, route.length, ...next)
          improved = true
        }
      }
    }
  }
  return [...route, ...rest]
}

export function routeLength(stops: Stop[]) {
  const g = stops.filter(hasCoords)
  return g.slice(1).reduce((t, s, i) => t + haversine(g[i], s), 0)
}

export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'trip'

export const CURRENCIES = ['GBP', 'EUR', 'USD', 'AUD', 'CAD', 'NZD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'THB', 'SGD', 'HKD', 'AED', 'ZAR', 'MXN', 'INR', 'IDR', 'KRW', 'TRY', 'PLN', 'CZK', 'HUF', 'ISK', 'MAD', 'VND', 'BRL']
