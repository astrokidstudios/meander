import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  Backpack, BedDouble, Bike, Binoculars, Building2, Bus, Camera, Car, Castle, Coffee, Compass, FerrisWheel,
  Flower2, Footprints, Landmark, Leaf, Luggage, MapPin, Mountain, MountainSnow, PawPrint, Pizza, Plane,
  Sailboat, Ship, ShoppingBag, Snowflake, Sun, Tent, Ticket, TrainFront, TreePalm, UtensilsCrossed, Wallet,
  Waves, Wine,
} from 'lucide-react'

/** Trip icons a person can pick. The key is what gets saved on the trip. */
export const TRIP_ICONS: Record<string, LucideIcon> = {
  palm: TreePalm, beach: Waves, mountain: Mountain, snow: MountainSnow, city: Building2, castle: Castle,
  landmark: Landmark, island: Sailboat, safari: Binoculars, wildlife: PawPrint, camping: Tent, hiking: Footprints,
  roadtrip: Car, cruise: Ship, flight: Plane, train: TrainFront, funfair: FerrisWheel, food: UtensilsCrossed,
  wine: Wine, coffee: Coffee, pizza: Pizza, backpack: Backpack, flowers: Flower2, autumn: Leaf,
  winter: Snowflake, sun: Sun, camera: Camera, compass: Compass,
}
export const TRIP_ICON_KEYS = Object.keys(TRIP_ICONS)

/** Trips made before icons stored an emoji. Map the old ones so nothing looks broken. */
const LEGACY: Record<string, string> = {
  '🌴': 'palm', '🏖️': 'beach', '🏔️': 'mountain', '🗼': 'city', '🏰': 'castle', '🗽': 'landmark', '🌋': 'mountain',
  '🏝️': 'island', '⛷️': 'snow', '🚐': 'roadtrip', '🚢': 'cruise', '✈️': 'flight', '🎡': 'funfair', '🍕': 'pizza',
  '🍣': 'food', '🥐': 'coffee', '🌮': 'food', '🎒': 'backpack', '🏕️': 'camping', '🌸': 'flowers', '🍁': 'autumn',
  '❄️': 'winter', '🎢': 'funfair', '🐘': 'safari', '🦁': 'safari', '🦒': 'safari', '🚗': 'roadtrip', '🧳': 'backpack',
}

export function tripIconKey(v?: string) {
  if (!v) return 'backpack'
  if (TRIP_ICONS[v]) return v
  return LEGACY[v] ?? LEGACY[v.replace(/️/g, '')] ?? LEGACY[v + '️'] ?? 'backpack'
}

export function TripIcon({ value, ...p }: { value?: string } & LucideProps) {
  const I = TRIP_ICONS[tripIconKey(value)] ?? Luggage
  return <I strokeWidth={1.75} {...p} />
}

export const STOP_ICONS = {
  sight: Landmark, food: UtensilsCrossed, stay: BedDouble, transport: TrainFront,
  activity: Ticket, shopping: ShoppingBag, other: MapPin,
} as const

export const EXPENSE_ICONS = {
  stay: BedDouble, transport: TrainFront, food: UtensilsCrossed, activities: Ticket, shopping: ShoppingBag, other: Wallet,
} as const

export const MODE_ICONS = { auto: Compass, walk: Footprints, transit: Bus, drive: Car, cycle: Bike } as const

/** Renders any icon component at a size that sits nicely inline with text. */
export function Ico({ as: I, size = 18, className = '', ...p }: { as: LucideIcon; size?: number } & LucideProps) {
  return <I size={size} strokeWidth={2} aria-hidden="true" className={`ico ${className}`} {...p} />
}
