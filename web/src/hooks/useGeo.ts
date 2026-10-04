import { useEffect, useState, useSyncExternalStore } from 'react'
import type { GeoPoint } from '~/lib/geo'
import { geocode, peekGeocode } from '~/lib/geo'
import { isIsoDate } from '~/lib/dates'
import type { Travel } from '~/lib/travel'
import { peekTravel, travelTime } from '~/lib/travel'
import type { DayWeather } from '~/lib/weather'
import { dayWeather, peekWeather } from '~/lib/weather'

/** Wait this long after the last keystroke before looking anything up. */
const DEBOUNCE_MS = 800

export interface Lookup<T> {
  data: T | null
  loading: boolean
}

const subscribe = (fn: () => void) => {
  window.addEventListener('online', fn)
  window.addEventListener('offline', fn)
  return () => {
    window.removeEventListener('online', fn)
    window.removeEventListener('offline', fn)
  }
}

export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => false)

const safely = <T>(fn: () => T | null | undefined): T | null | undefined => {
  try {
    return fn()
  } catch {
    return null
  }
}

/**
 * Runs `run` for `key` (null: nothing to look up) once typing settles, with
 * cached answers (`peek`) shown at once. Offline it does nothing; failures
 * read as no data.
 */
function useLookup<T>(key: string | null, peek: () => T | null | undefined, run: () => Promise<T | null>): Lookup<T> {
  const online = useOnline()
  const [done, setDone] = useState<{ key: string; data: T | null } | null>(null)
  const active = online && key ? key : null
  const cached = active ? safely(peek) : null
  const known = cached !== undefined

  useEffect(() => {
    if (!active || known) return
    let live = true
    const t = setTimeout(() => {
      run().then(
        (data) => live && setDone({ key: active, data }),
        () => live && setDone({ key: active, data: null }),
      )
    }, DEBOUNCE_MS)
    return () => {
      live = false
      clearTimeout(t)
    }
    // `run` is a fresh closure every render; `active` covers its inputs.
  }, [active, known])

  if (!active) return { data: null, loading: false }
  if (known) return { data: cached ?? null, loading: false }
  if (done?.key === active) return { data: done.data, loading: false }
  return { data: null, loading: true }
}

/** Coordinates of a place, `near` being the board's place. */
export function useGeocode(place: string, near?: string): Lookup<GeoPoint> {
  const p = place.trim()
  return useLookup(p ? `${p}|${near ?? ''}` : null, () => peekGeocode(p, near), () => geocode(p, near))
}

/** The weather on `date` at `place` (forecast, or typical when too far out). */
export function useWeather(place: string, date: string, near?: string): Lookup<DayWeather> {
  const p = place.trim()
  return useLookup(
    p && isIsoDate(date) ? `${p}|${near ?? ''}|${date}` : null,
    () => {
      const g = peekGeocode(p, near)
      return g ? peekWeather(g.lat, g.lon, date) : g
    },
    async () => {
      const g = await geocode(p, near)
      return g ? dayWeather(g.lat, g.lon, date) : null
    },
  )
}

/** Travel time from place `a` to place `b`. */
export function useTravel(a: string, b: string, near?: string): Lookup<Travel> {
  const [x, y] = [a.trim(), b.trim()]
  return useLookup(
    x && y && x !== y ? `${x}|${y}|${near ?? ''}` : null,
    () => {
      const [ga, gb] = [peekGeocode(x, near), peekGeocode(y, near)]
      if (ga === null || gb === null) return null
      return ga && gb ? peekTravel(ga, gb) : undefined
    },
    async () => {
      const [ga, gb] = await Promise.all([geocode(x, near), geocode(y, near)])
      return ga && gb ? travelTime(ga, gb) : null
    },
  )
}
