# Meander

A personal, offline-first trip planner: trips, day-by-day itineraries, saved places, a map, budget and notes.
Everything is stored on the device (IndexedDB). No account, no server.

## Features
- **Trips** with dates, currency, budget, number of travellers, colour.
- **Day timeline**: set the time you set off, how long you stay at each place (sensible defaults by type), and how you get around. Each stop shows arrive/leave times, travel time between stops (estimated, or set your own), free time before bookings and a warning if you would be late. "Open day in Google Maps" opens the whole day as a route.
- **Itinerary**: one card per day, with times, costs, booking refs, notes, done-ticks, a title and notes per day.
  Distance and a walk/drive estimate between stops, **Sort by time** and **Optimise route** (shortest order, first stop kept).
- **Saved places**: a wishlist you schedule into days with the calendar picker on each place.
- **Place search** (OpenStreetMap, needs internet) with auto-categories; paste a Google/Apple Maps link or "lat, lng" to set a pin offline; drop pins on the map.
- **Map**: numbered pins coloured by day, dotted route lines, day filter, "my location".
  Map tiles you have viewed are cached for offline use (web/iPhone version).
- **Budget**: expenses + costs from itinerary places, by category, per person, "who paid / who owes".
- **Notes**: trip notes, packing list (with a starter list), to-do list.
- **Backup**: export one trip or everything to a `.json` file and import it on another device. Print / Save as PDF.

## Running it
| Where | How |
|---|---|
| Windows | `release/Meander-Setup-1.0.0.exe` (installer) or `release/Meander-Portable-1.0.0.exe` (no install). Unsigned, so SmartScreen may warn: More info → Run anyway. |
| Mac | Either open the hosted web version in Safari → File → **Add to Dock**, or on a Mac run `npm install && npm run dist:mac` to build a `.dmg`. |
| iPhone | Open the hosted web version in Safari → Share → **Add to Home Screen**. It then runs full-screen and offline. |
| Dev | `npm install`, then `npm run dev` (web) or `npm run desktop` (desktop window). |

Each install keeps its own data. Use **Back up all** / **Import** to move trips between devices (e.g. AirDrop or iCloud Drive the file).

## Scripts
- `npm run build` – web build into `dist/` (this folder is what gets hosted for iPhone/Mac).
- `npm run dist:win` – Windows installer + portable exe into `release/`.
- `npm run dist:mac` – Mac `.dmg` (must be run on a Mac).
- `npm run icons` – regenerate PNG icons from `scripts/icon-full.svg` / `public/favicon.svg`.
- `node scripts/smoke.mjs <outdir>` – end-to-end test in headless Edge (needs `npx vite preview --port 4174 --host 127.0.0.1` running).

## Stack
React 19 + TypeScript + Vite, Dexie (IndexedDB), Leaflet + OpenStreetMap tiles, vite-plugin-pwa (offline service worker), Electron for the desktop build.
