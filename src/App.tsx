import { useEffect, useState } from 'react'
import TripList from './components/TripList'
import TripView from './components/TripView'
import { useOnline } from './hooks'

export type Tab = 'plan' | 'places' | 'map' | 'budget' | 'notes'

type Route = { view: 'home' } | { view: 'trip'; id: string; tab: Tab }

function parseHash(): Route {
  const parts = location.hash.replace(/^#\/?/, '').split('/')
  if (parts[0] === 'trip' && parts[1]) {
    const tab = (['plan', 'places', 'map', 'budget', 'notes'] as Tab[]).includes(parts[2] as Tab)
      ? (parts[2] as Tab)
      : 'plan'
    return { view: 'trip', id: parts[1], tab }
  }
  return { view: 'home' }
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
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="app">
      {!online && <div className="offline-bar">Offline: everything still works and saves on this device. Search and new map areas need internet.</div>}
      {route.view === 'home' ? (
        <TripList />
      ) : (
        <TripView key={route.id} tripId={route.id} tab={route.tab} />
      )}
    </div>
  )
}
