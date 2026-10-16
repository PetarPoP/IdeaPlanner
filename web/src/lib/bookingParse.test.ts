import { describe, expect, it } from 'vitest'
import { findDates, guessBooking } from './bookingParse'

describe('guessBooking', () => {
  it('reads a flight confirmation', () => {
    const g = guessBooking('Your flight TP 1234 is confirmed', 'Booking reference: TP4K9Q\nZAG → LIS on 12 Jun 2027 at 07:05\nReturn LIS → ZAG Jun 19, 2027 18:40\nTotal paid: €840.00')!
    expect(g.kind).toBe('Flight')
    expect(g.title).toBe('TP 1234')
    expect([g.from, g.to]).toEqual(['ZAG', 'LIS'])
    expect([g.startDate, g.startTime, g.endDate, g.endTime]).toEqual(['2027-06-12', '07:05', '2027-06-19', '18:40'])
    expect(g.conf).toBe('TP4K9Q')
    expect([g.cost, g.cur]).toEqual(['840.00', '€'])
  })

  it('reads a stay and ignores mail that is not a booking', () => {
    const g = guessBooking('Casa Azul: reservation confirmed', 'Check-in 14.06.2027 from 15:00, check-out 18.06.2027 until 11:00. Total 1.200 EUR')!
    expect(g.kind).toBe('Stay')
    expect([g.startDate, g.endDate]).toEqual(['2027-06-14', '2027-06-18'])
    expect([g.cost, g.cur]).toEqual(['1200', '€'])
    expect(guessBooking('Lunch?', 'Want to grab lunch tomorrow?')).toBeNull()
  })

  it('finds dates in several formats', () => {
    expect(findDates('2027-01-02, 3/4/2027 and March 5th 2027', 2027)).toEqual(['2027-01-02', '2027-04-03', '2027-03-05'])
  })
})
