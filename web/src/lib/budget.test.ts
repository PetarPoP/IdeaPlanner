import { describe, expect, it } from 'vitest'
import { settleUp, summarize } from './budget'
import { num } from './money'
import { fromTemplate } from './templates'

describe('num', () => {
  it('reads typed amounts leniently', () => {
    expect(num('12,5')).toBe(12.5)
    expect(num('')).toBe(0)
    expect(num('abc')).toBe(0)
  })
})

describe('summarize', () => {
  it('totals the road trip template like the design', () => {
    const s = summarize(fromTemplate('roadtrip', { id: 'x' }))
    // sections 1080 + 740 + 420 + 500, itineraries 90 + 180, flight 840
    expect(s.total).toBe(3850)
    // paid: apartment 420 (Ana), van 520 (Luka), groceries 300 (Maja), flight 840 (Ana)
    expect(s.paid).toBe(2080)
    expect(s.paidBy.slice(0, 3)).toEqual([1260, 300, 520])
    expect(s.balances.reduce((a, b) => a + b, 0)).toBeCloseTo(0)
  })
})

describe('currencies and settlements', () => {
  it('converts foreign costs and counts payments made to settle up', () => {
    const b = fromTemplate('roadtrip', { id: 'x' })
    const before = summarize(b)
    const flight = b.nodes.find((n) => n.type === 'booking')!
    const usd = { ...b, rates: { $: 0.5 }, nodes: b.nodes.map((n) => (n.id === flight.id ? { ...n, cur: '$' } : n)) }
    // The 840 flight was typed in dollars, worth half as much.
    expect(summarize(usd).total).toBe(before.total - 420)

    const t = before.transfers[0]!
    const settled = summarize({ ...b, settlements: [{ id: 's', from: t.from, to: t.to, amount: String(t.amount), t: 0 }] })
    expect(settled.transfers.length).toBe(before.transfers.length - 1)
  })
})

describe('settleUp', () => {
  it('settles everyone with at most n-1 transfers', () => {
    const balances = [60, -20, -20, -20]
    const t = settleUp(balances)
    expect(t).toHaveLength(3)
    expect(t.every((x) => x.to === 0 && x.amount === 20)).toBe(true)
  })

  it('ignores rounding noise', () => {
    expect(settleUp([0.2, -0.2])).toEqual([])
  })
})

describe('rates', () => {
  it('knows the common symbols', async () => {
    const { isoOf, needsRates } = await import('./rates')
    expect(isoOf('din')).toBe('RSD')
    expect(isoOf('usd')).toBe('USD')
    expect(isoOf('??')).toBeNull()
    const b = fromTemplate('roadtrip', { id: 'x' })
    expect(needsRates(b)).toBe(false)
    const withUsd = { ...b, nodes: b.nodes.map((n) => (n.type === 'booking' ? { ...n, cur: '$' } : n)) }
    expect(needsRates(withUsd)).toBe(true)
    expect(needsRates({ ...withUsd, rates: { $: 0.9 }, ratesAt: Date.now() })).toBe(false)
  })
})
