import { createCache, getJson } from './cache'
import type { GeoPoint } from './geo'
import { haversineKm } from './geo'

export { haversineKm }

export interface Travel {
  /** Driving time in minutes and road distance in km, when a route was found. */
  driveMin: number | null
  driveKm: number | null
  /** Walking time in minutes, for stops close together. */
  walkMin: number | null
}

/** Below this straight-line distance (km) walking is worth showing. */
const WALK_KM = 1.2
const WALK_KMH = 5
/** Streets are longer than the straight line. */
const DETOUR = 1.3

const cache = createCache<Travel>('ideaPlanner.travel')

/** Walking minutes between two points, from the straight-line distance. */
export const walkMinutes = (km: number) => Math.max(1, Math.round(((km * DETOUR) / WALK_KMH) * 60))

/** "12 min", "1 h 5 min", "2 h". */
export function minutes(m: number): string {
  const r = Math.max(1, Math.round(m))
  if (r < 60) return `${r} min`
  const h = Math.floor(r / 60)
  return r % 60 ? `${h} h ${r % 60} min` : `${h} h`
}

/** "9 min walk" for close stops, else "12 min drive · 8.4 km"; empty when unknown. */
export function travelLabel(t: Travel, withKm = true): string {
  if (t.walkMin != null) return `${minutes(t.walkMin)} walk`
  if (t.driveMin == null) return ''
  const km = t.driveKm == null || !withKm ? '' : ` · ${t.driveKm < 10 ? t.driveKm.toFixed(1) : Math.round(t.driveKm)} km`
  return `${minutes(t.driveMin)} drive${km}`
}

const r4 = (n: number) => n.toFixed(4)
const keyOf = (a: GeoPoint, b: GeoPoint) => `${r4(a.lat)},${r4(a.lon)};${r4(b.lat)},${r4(b.lon)}`

/** Close stops are a walk, no route needed. */
function walk(a: GeoPoint, b: GeoPoint): Travel | null {
  const km = haversineKm(a, b)
  return km < WALK_KM ? { driveMin: null, driveKm: null, walkMin: walkMinutes(km) } : null
}

/** Cached answer for `travelTime`: undefined when not looked up yet. */
export const peekTravel = (a: GeoPoint, b: GeoPoint) => walk(a, b) ?? cache.peek(keyOf(a, b))

/** Driving time on the public OSRM server, or a walking estimate for close stops. */
export function travelTime(a: GeoPoint, b: GeoPoint): Promise<Travel> {
  const w = walk(a, b)
  if (w) return Promise.resolve(w)
  return cache.get(keyOf(a, b), async () => {
    const r = await getJson<{ code: string; routes?: Array<{ duration: number; distance: number }> }>(
      `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`,
    )
    const route = r.code === 'Ok' ? r.routes?.[0] : undefined
    return { driveMin: route ? route.duration / 60 : null, driveKm: route ? Math.round(route.distance / 100) / 10 : null, walkMin: null }
  })
}
