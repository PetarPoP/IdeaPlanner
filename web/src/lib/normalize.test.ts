import { describe, expect, it } from 'vitest'
import type { Board } from './model.gen'
import { normalizeBoard } from './normalize'

describe('normalizeBoard', () => {
  it('upgrades boards saved before dates were pickers', () => {
    const old = {
      id: 'b',
      title: 'Trip',
      icon: 'van',
      date: '2027-06-12',
      cap: '',
      cur: '€',
      splitN: 1,
      people: [],
      nodes: [
        { id: 'd', x: 0, y: 0, w: 300, title: 'Day 1', icon: 'calendar-dots', accent: false, type: 'itinerary', date: 'Sat, Jun 12', stops: [] },
        { id: 'f', x: 0, y: 0, w: 280, title: 'Flight', icon: 'airplane-tilt', accent: false, type: 'booking', kind: 'Flight', from: 'ZAG', to: 'LIS', when: 'Jun 12 · 7:05', conf: '', cost: '', paid: false, payer: 0 },
      ],
      strokes: [{ id: 's', pts: [[0, 0]] }],
    } as unknown as Board
    const b = normalizeBoard(old)
    expect(b.endDate).toBe('')
    expect(b.place).toBe('')
    expect(b.edges).toEqual([])
    expect(b.strokes[0]!.color).toBe('')
    const [day, flight] = b.nodes
    expect(day!.type === 'itinerary' && day!.date).toBe('2027-06-12')
    expect(flight!.type === 'booking' && [flight!.startDate, flight!.startTime, flight!.endDate]).toEqual(['2027-06-12', '07:05', ''])
    expect('when' in flight!).toBe(false)
  })
})
