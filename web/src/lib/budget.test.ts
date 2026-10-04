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
