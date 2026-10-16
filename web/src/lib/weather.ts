import { createCache, getJson } from './cache'
import { daysBetween, toIso } from './dates'

export type WeatherIcon = 'Sun' | 'CloudSun' | 'Cloud' | 'CloudFog' | 'CloudRain' | 'CloudSnow' | 'CloudLightning'

export interface DayWeather {
  /** WMO weather code. */
  code: number
  label: string
  icon: WeatherIcon
  /** °C, rounded. */
  max: number
  min: number
  /** Chance of rain in %, when forecast. */
  rain: number | null
  /** What the weather was on this date last year, for days too far out to forecast. */
  typical: boolean
}

/** Open-Meteo forecasts this many days ahead, today included. */
const FORECAST_DAYS = 16
/** The archive trails today by a few days; nearer past days come from the forecast API. */
const ARCHIVE_LAG = 6
const FORECAST_TTL = 3 * 3600e3
const DAY_MS = 864e5

const cache = createCache<DayWeather | null>('ideaPlanner.weather')

/** WMO code → what to show. */
export function wmo(code: number): { label: string; icon: WeatherIcon } {
  if (code <= 1) return { label: code ? 'Mainly clear' : 'Clear', icon: 'Sun' }
  if (code === 2) return { label: 'Partly cloudy', icon: 'CloudSun' }
  if (code === 3) return { label: 'Overcast', icon: 'Cloud' }
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'CloudFog' }
  if (code >= 51 && code <= 55) return { label: 'Drizzle', icon: 'CloudRain' }
  if (code === 56 || code === 57) return { label: 'Freezing drizzle', icon: 'CloudRain' }
  if (code >= 61 && code <= 65) return { label: code === 65 ? 'Heavy rain' : 'Rain', icon: 'CloudRain' }
  if (code === 66 || code === 67) return { label: 'Freezing rain', icon: 'CloudRain' }
  if (code >= 71 && code <= 77) return { label: code === 75 ? 'Heavy snow' : 'Snow', icon: 'CloudSnow' }
  if (code >= 80 && code <= 82) return { label: 'Rain showers', icon: 'CloudRain' }
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: 'CloudSnow' }
  if (code === 95) return { label: 'Thunderstorm', icon: 'CloudLightning' }
  if (code === 96 || code === 99) return { label: 'Thunderstorm with hail', icon: 'CloudLightning' }
  return { label: 'Cloudy', icon: 'Cloud' }
}

/**
 * Where a date's weather comes from: the forecast for the next 16 days (and
 * the last few), the archive for older days, and for later days the same
 * date in the most recent year that is already in the archive.
 */
export function weatherSource(iso: string, today = toIso(new Date())): { api: 'forecast' | 'archive'; date: string; typical: boolean } | null {
  const d = daysBetween(today, iso)
  if (d == null) return null
  if (d >= -ARCHIVE_LAG && d < FORECAST_DAYS) return { api: 'forecast', date: iso, typical: false }
  if (d < 0) return { api: 'archive', date: iso, typical: false }
  const [y, md] = [Number(iso.slice(0, 4)), iso.slice(4)]
  for (let year = y - 1; year > y - 10; year--) {
    // Feb 29 falls back to Feb 28 in other years.
    const same = `${year}${md}`
    const date = toIso(new Date(`${same}T00:00:00`)) === same ? same : `${year}-02-28`
    if ((daysBetween(date, today) ?? 0) > ARCHIVE_LAG) return { api: 'archive', date, typical: true }
  }
  return null
}

/** "24° / 17°", or "Usually 24°" for a typical value. */
export const tempLabel = (w: DayWeather) => (w.typical ? `Usually ${w.max}°` : `${w.max}° / ${w.min}°`)

/** Tooltip: "Partly cloudy · 30% chance of rain". */
export function weatherTitle(w: DayWeather): string {
  if (w.typical) return `Usually around ${w.max}° / ${w.min}° (${w.label.toLowerCase()} on this date last year)`
  return w.rain != null ? `${w.label} · ${w.rain}% chance of rain` : w.label
}

const r1 = (n: number) => Math.round(n * 100) / 100

/** Cached answer for `dayWeather`: undefined when not looked up yet. */
export function peekWeather(lat: number, lon: number, iso: string) {
  const src = weatherSource(iso)
  return src ? cache.peek(keyOf(lat, lon, src)) : null
}

const keyOf = (lat: number, lon: number, s: { api: string; date: string }) => `${r1(lat)},${r1(lon)}:${s.api}:${s.date}`

interface Daily {
  daily?: {
    weather_code?: Array<number | null>
    temperature_2m_max?: Array<number | null>
    temperature_2m_min?: Array<number | null>
    precipitation_probability_max?: Array<number | null>
  }
}

/** The day's weather at a point: forecast when possible, otherwise last year's. Null when the API has nothing. */
export function dayWeather(lat: number, lon: number, iso: string): Promise<DayWeather | null> {
  const src = weatherSource(iso)
  if (!src) return Promise.resolve(null)
  const base = src.api === 'forecast' ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive'
  const daily = src.api === 'forecast' ? 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' : 'weather_code,temperature_2m_max,temperature_2m_min'
  const url = `${base}?latitude=${r1(lat)}&longitude=${r1(lon)}&daily=${daily}&timezone=auto&start_date=${src.date}&end_date=${src.date}`
  return cache.get(
    keyOf(lat, lon, src),
    async () => parseDaily(await getJson<Daily>(url), src.typical),
    // Archive values never change; an empty answer is retried the next day.
    (w) => (src.api === 'forecast' ? FORECAST_TTL : w ? undefined : DAY_MS),
  )
}

export function parseDaily(r: Daily, typical: boolean): DayWeather | null {
  const d = r.daily
  const code = d?.weather_code?.[0]
  const max = d?.temperature_2m_max?.[0]
  const min = d?.temperature_2m_min?.[0]
  if (code == null || max == null || min == null) return null
  const rain = d?.precipitation_probability_max?.[0]
  return { code, ...wmo(code), max: Math.round(max), min: Math.round(min), rain: typical ? null : (rain ?? null), typical }
}
