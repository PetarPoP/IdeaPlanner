import { describe, expect, it } from 'vitest'
import { countdown, dateLabel, daysBetween, looseToIso, rangeLabel } from './dates'

const at = (iso: string) => new Date(`${iso}T12:00:00`)

describe('rangeLabel', () => {
  it('shortens ranges inside one month or year', () => {
    expect(rangeLabel('2027-06-12', '2027-06-19')).toBe('Jun 12 – 19, 2027')
    expect(rangeLabel('2027-06-28', '2027-07-03')).toBe('Jun 28 – Jul 3, 2027')
    expect(rangeLabel('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027')
    expect(rangeLabel('2027-06-12', '')).toBe('Jun 12, 2027')
    expect(rangeLabel('', '2027-06-12')).toBe('')
  })
})

describe('countdown', () => {
  it('counts down, then through the trip', () => {
    expect(countdown('2027-06-12', '2027-06-19', at('2027-06-01'))).toBe('in 11 days')
    expect(countdown('2027-06-12', '2027-06-19', at('2027-06-11'))).toBe('tomorrow')
    expect(countdown('2027-06-12', '2027-06-19', at('2027-06-14'))).toBe('day 3 of 8')
    expect(countdown('2027-06-12', '2027-06-19', at('2027-06-20'))).toBe('ended')
    expect(dateLabel('', '')).toBe('Add dates')
  })
})

describe('looseToIso', () => {
  it('reads dates typed before the pickers', () => {
    expect(looseToIso('Sat, Jun 12', 2027)).toBe('2027-06-12')
    expect(looseToIso('12.6.2027', 2020)).toBe('2027-06-12')
    expect(looseToIso('2027-06-12', 2020)).toBe('2027-06-12')
    expect(looseToIso('someday', 2027)).toBe('')
    expect(daysBetween('2027-06-12', '2027-06-19')).toBe(7)
  })
})
