import { afterEach, describe, expect, it, vi } from 'vitest'
import { haversineKm, minutes, travelLabel, travelTime, walkMinutes } from './travel'
import { primaryPlace } from './geo'

const lisbon = { lat: 38.7223, lon: -9.1393, name: 'Lisbon' }
const sintra = { lat: 38.8029, lon: -9.3817, name: 'Sintra' }

describe('haversineKm', () => {
  it('measures great-circle distance', () => {
    expect(haversineKm(lisbon, lisbon)).toBe(0)
    expect(haversineKm(lisbon, sintra)).toBeCloseTo(22.6, 0)
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.2, 0)
  })
})

describe('formatting', () => {
  it('formats minutes', () => {
    expect(minutes(0.2)).toBe('1 min')
    expect(minutes(12.4)).toBe('12 min')
    expect(minutes(65)).toBe('1 h 5 min')
    expect(minutes(120)).toBe('2 h')
  })
  it('estimates walks at 5 km/h with detours', () => {
    expect(walkMinutes(1)).toBe(16)
  })
  it('labels drives and walks', () => {
    expect(travelLabel({ driveMin: 12, driveKm: 8.4, walkMin: null })).toBe('12 min drive · 8.4 km')
    expect(travelLabel({ driveMin: 12, driveKm: 8.4, walkMin: null }, false)).toBe('12 min drive')
    expect(travelLabel({ driveMin: 95, driveKm: 120.3, walkMin: null })).toBe('1 h 35 min drive · 120 km')
    expect(travelLabel({ driveMin: null, driveKm: null, walkMin: 9 })).toBe('9 min walk')
    expect(travelLabel({ driveMin: null, driveKm: null, walkMin: null })).toBe('')
  })
  it('takes the first place of a route', () => {
    expect(primaryPlace('Lisbon → Algarve')).toBe('Lisbon')
  })
})

describe('travelTime', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('walks between close stops without asking for a route', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const t = await travelTime(lisbon, { lat: 38.7253, lon: -9.1393, name: 'near' })
    expect(t.walkMin).toBeGreaterThan(0)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('routes farther stops on OSRM', async () => {
    const fetch = vi.fn(async () => Response.json({ code: 'Ok', routes: [{ duration: 1680, distance: 28_440 }] }))
    vi.stubGlobal('fetch', fetch)
    expect(await travelTime(lisbon, sintra)).toEqual({ driveMin: 28, driveKm: 28.4, walkMin: null })
    expect(String(fetch.mock.calls[0])).toContain('router.project-osrm.org/route/v1/driving/-9.1393,38.7223;-9.3817,38.8029')
  })
})
