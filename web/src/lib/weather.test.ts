import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCache, evict } from './cache'
import { dayWeather, parseDaily, tempLabel, weatherSource, weatherTitle, wmo } from './weather'

describe('wmo', () => {
  it('maps weather codes to a label and icon', () => {
    expect(wmo(0)).toEqual({ label: 'Clear', icon: 'Sun' })
    expect(wmo(2).icon).toBe('CloudSun')
    expect(wmo(3).icon).toBe('Cloud')
    expect(wmo(48).icon).toBe('CloudFog')
    expect(wmo(53).icon).toBe('CloudRain')
    expect(wmo(81)).toEqual({ label: 'Rain showers', icon: 'CloudRain' })
    expect(wmo(75)).toEqual({ label: 'Heavy snow', icon: 'CloudSnow' })
    expect(wmo(99).icon).toBe('CloudLightning')
    expect(wmo(42).icon).toBe('Cloud')
  })
})

describe('weatherSource', () => {
  const today = '2026-10-04'
  it('forecasts the next 16 days and the last few', () => {
    expect(weatherSource('2026-10-04', today)).toEqual({ api: 'forecast', date: '2026-10-04', typical: false })
    expect(weatherSource('2026-10-19', today)?.api).toBe('forecast')
    expect(weatherSource('2026-10-01', today)?.api).toBe('forecast')
  })
  it('uses the archive for the past', () => {
    expect(weatherSource('2025-06-12', today)).toEqual({ api: 'archive', date: '2025-06-12', typical: false })
  })
  it('uses the same date in an archived year for later days', () => {
    expect(weatherSource('2026-10-20', today)).toEqual({ api: 'archive', date: '2025-10-20', typical: true })
    expect(weatherSource('2027-12-01', today)).toEqual({ api: 'archive', date: '2025-12-01', typical: true })
    expect(weatherSource('2028-02-29', today)).toEqual({ api: 'archive', date: '2026-02-28', typical: true })
  })
  it('ignores non-dates', () => {
    expect(weatherSource('', today)).toBeNull()
  })
})

describe('labels', () => {
  const w = { code: 2, label: 'Partly cloudy', icon: 'CloudSun' as const, max: 24, min: 17, rain: 30, typical: false }
  it('formats forecasts and typical values', () => {
    expect(tempLabel(w)).toBe('24° / 17°')
    expect(weatherTitle(w)).toBe('Partly cloudy · 30% chance of rain')
    expect(tempLabel({ ...w, typical: true })).toBe('Usually 24°')
  })
  it('parses a daily answer', () => {
    const d = { daily: { weather_code: [61], temperature_2m_max: [18.6], temperature_2m_min: [11.2], precipitation_probability_max: [80] } }
    expect(parseDaily(d, false)).toEqual({ code: 61, label: 'Rain', icon: 'CloudRain', max: 19, min: 11, rain: 80, typical: false })
    expect(parseDaily({ daily: { weather_code: [null] } }, false)).toBeNull()
  })
})

describe('dayWeather', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('asks once per place and day', async () => {
    const fetch = vi.fn(async () => Response.json({ daily: { weather_code: [0], temperature_2m_max: [25], temperature_2m_min: [15], precipitation_probability_max: [5] } }))
    vi.stubGlobal('fetch', fetch)
    const iso = new Date().toISOString().slice(0, 10)
    const [a, b] = await Promise.all([dayWeather(38.72, -9.14, iso), dayWeather(38.72, -9.14, iso)])
    expect(a?.max).toBe(25)
    expect(b).toEqual(a)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0])).toContain('api.open-meteo.com/v1/forecast')
  })
})

describe('cache', () => {
  it('drops expired entries and the least recently used beyond the cap', () => {
    const m = new Map([
      ['a', { v: 1 }],
      ['b', { v: 2, x: 0 }],
      ['c', { v: 3 }],
      ['d', { v: 4 }],
    ])
    evict(m, 2, 1000)
    expect([...m.keys()]).toEqual(['c', 'd'])
  })
  it('keeps recently read entries', () => {
    const c = createCache<number>(null, 2)
    c.set('a', 1)
    c.set('b', 2)
    c.peek('a')
    c.set('c', 3)
    expect(c.peek('a')).toBe(1)
    expect(c.peek('b')).toBeUndefined()
  })
  it('shares running lookups and does not cache failures', async () => {
    const c = createCache<number>(null)
    const run = vi.fn(async () => 7)
    await Promise.all([c.get('k', run), c.get('k', run)])
    expect(run).toHaveBeenCalledTimes(1)
    await expect(c.get('x', async () => Promise.reject(new Error('offline')))).rejects.toThrow()
    expect(c.peek('x')).toBeUndefined()
  })
})
