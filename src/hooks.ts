import type { StopCategory } from './db'
import { useEffect, useState } from 'react'

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export interface GeoResult {
  name: string
  address: string
  lat: number
  lng: number
  category: StopCategory
}

/** Guess our category from OpenStreetMap's class/type tags. */
function guessCategory(cls = '', type = ''): StopCategory {
  if (/restaurant|cafe|bar|pub|fast_food|food_court|bakery|ice_cream|biergarten|marketplace/.test(type)) return 'food'
  if (/hotel|hostel|guest_house|motel|apartment|camp_site|chalet/.test(type)) return 'stay'
  if (cls === 'railway' || cls === 'aeroway' || /station|aerodrome|bus_stop|ferry|terminal|airport/.test(type)) return 'transport'
  if (cls === 'shop' || /mall|department_store/.test(type)) return 'shopping'
  if (/theme_park|zoo|aquarium|cinema|theatre|stadium|sports|beach|park|nature_reserve|water_park/.test(type) || cls === 'leisure') return 'activity'
  if (cls === 'tourism' || cls === 'historic' || /museum|monument|castle|church|cathedral|viewpoint|attraction|gallery|memorial/.test(type)) return 'sight'
  return 'other'
}

/** Place search via OpenStreetMap Nominatim (needs internet). Called only on submit, never per keystroke. */
export async function searchPlaces(q: string, near?: { lat: number; lng: number } | null): Promise<GeoResult[]> {
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '8', addressdetails: '0' })
  if (near) {
    const d = 0.6
    params.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`)
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'Accept-Language': navigator.language || 'en' },
  })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const rows: { display_name: string; name?: string; lat: string; lon: string; category?: string; type?: string }[] = await res.json()
  return rows.map((r) => ({
    name: r.name || r.display_name.split(',')[0],
    address: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    category: guessCategory(r.category, r.type),
  }))
}
