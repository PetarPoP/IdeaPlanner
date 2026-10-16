import { createCache, getJson } from './cache'

export interface GeoPoint {
  lat: number
  lon: number
  name: string
}

/** How far (km) a stop may be from the board's place before it counts as a different town of the same name. */
const NEAR_KM = 400
/** Nominatim's usage policy: at most one request per second. */
const NOMINATIM_GAP_MS = 1100

const cache = createCache<GeoPoint | null>('ideaPlanner.geo')

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The first place of free text like "Lisbon → Algarve". */
export const primaryPlace = (s: string) => s.split(/→|->|;|\n/)[0]!.trim()

const norm = (s: string) => primaryPlace(s).toLowerCase().replace(/\s+/g, ' ')

const keyOf = (place: string, near?: string) => {
  const q = norm(place)
  const n = near ? norm(near) : ''
  return n && n !== q ? `${q}|${n}` : q
}

/** Cached answer for `geocode(place, near)`: undefined when not looked up yet, null when nothing was found. */
export const peekGeocode = (place: string, near?: string) => (norm(place) ? cache.peek(keyOf(place, near)) : null)

/**
 * Coordinates of a place name. Town names go to Open-Meteo; street-level
 * names (and towns it doesn't know) to Nominatim. `near` (the board's place)
 * picks the right one of several towns with the same name.
 */
export function geocode(place: string, near?: string): Promise<GeoPoint | null> {
  const q = primaryPlace(place)
  if (!q) return Promise.resolve(null)
  const key = keyOf(place, near)
  const ctx = near && key.includes('|') ? primaryPlace(near) : ''
  return cache.get(key, async () => {
    const center = ctx ? await geocode(ctx) : null
    const close = (p: GeoPoint) => !center || haversineKm(p, center) < NEAR_KM
    // Open-Meteo only knows place names; skip it for addresses.
    const towns = /\d/.test(q) ? [] : await openMeteo(q)
    const town = towns.find(close)
    if (town) return town
    const hit = await nominatim(center && !q.toLowerCase().includes(ctx.toLowerCase()) ? `${q}, ${ctx}` : q)
    return hit && close(hit) ? hit : null
  })
}

interface OpenMeteoGeo {
  results?: Array<{ name: string; latitude: number; longitude: number; country?: string }>
}

async function openMeteo(q: string): Promise<GeoPoint[]> {
  const r = await getJson<OpenMeteoGeo>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&format=json`)
  return (r.results ?? []).map((x) => ({ lat: x.latitude, lon: x.longitude, name: x.country ? `${x.name}, ${x.country}` : x.name }))
}

let nextSlot = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function nominatim(q: string): Promise<GeoPoint | null> {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + NOMINATIM_GAP_MS
  if (at > now) await sleep(at - now)
  const r = await getJson<Array<{ lat: string; lon: string; display_name: string }>>(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
  )
  const x = r[0]
  return x ? { lat: Number(x.lat), lon: Number(x.lon), name: x.display_name } : null
}
