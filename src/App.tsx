import { useEffect, useState } from 'react'
import TripList from './components/TripList'
import TripView from './components/TripView'
import { useOnline } from './hooks'
import Confetti from './components/Confetti'
import { WifiOff } from 'lucide-react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import JoinTrip from './components/JoinTrip'

export type Tab = 'plan' | 'places' | 'map' | 'budget' | 'notes'

type Route = { view: 'home' } | { view: 'trip'; id: string; tab: Tab } | { view: 'join'; code: string }

function parseHash(): Route {
  const parts = location.hash.replace(/^#\/?/, '').split('/')
  if (parts[0] === 'join' && parts[1]) return { view: 'join', code: parts[1].replace(/[^a-f0-9]/gi, '') }
  if (parts[0] === 'trip' && parts[1]) {
    const tab = (['plan', 'places', 'map', 'budget', 'notes'] as Tab[]).includes(parts[2] as Tab)
      ? (parts[2] as Tab)
      : 'plan'
    return { view: 'trip', id: parts[1], tab }
  }
  return { view: 'home' }
}

/**
 * A private build can ship trips in public/seed.json (never committed — see .gitignore).
 * They're imported once on first launch; ids are kept, so it never duplicates.
 */
async function importSeedOnce() {
  try {
    if (localStorage.getItem('meander:seeded')) return
    const res = await fetch('./seed.json', { cache: 'no-store' })
    if (!res.ok) return
    const { importData } = await import('./db')
    await importData(await res.json())
    localStorage.setItem('meander:seeded', '1')
  } catch {
    /* no seed in this build */
  }
}

export const go = (path: string) => {
  location.hash = path
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  const online = useOnline()

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    // Ask the browser to keep our data even when storage is low.
    navigator.storage?.persist?.().catch(() => {})
    importSeedOnce()
    // Invite links opened in the app (meander://join/<code>, or the web link handed over by iOS).
    const sub = Capacitor.isNativePlatform()
      ? CapApp.addListener('appUrlOpen', ({ url }) => { const m = url.match(/join\/([a-f0-9]+)/i); if (m) location.hash = `/join/${m[1]}` })
      : null
    return () => { window.removeEventListener('hashchange', onHash); sub?.then((s) => s.remove()) }
  }, [])

  return (
    <div className="app">
      {!online && <div className="offline-bar"><WifiOff size={15} aria-hidden="true" /> Offline mode: everything still works and saves. Search needs internet.</div>}
      <Confetti />
      {route.view === 'join' ? (
        <JoinTrip code={route.code} />
      ) : route.view === 'home' ? (
        <TripList />
      ) : (
        <TripView key={route.id} tripId={route.id} tab={route.tab} />
      )}
    </div>
  )
}
