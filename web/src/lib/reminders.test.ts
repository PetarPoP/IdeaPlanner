import { describe, expect, it } from 'vitest'
import { upcoming } from './reminders'
import { fromTemplate } from './templates'

describe('reminders', () => {
  it('lists bookings, day plans and payments due in the window', () => {
    const b = fromTemplate('roadtrip', { id: 'x' })
    const flight = b.nodes.find((n) => n.type === 'booking')!
    const r = upcoming(b, '2027-06-12', '2027-06-12')
    expect(r.some((x) => x.nodeId === flight.id && x.what === 'Depart')).toBe(true)
    expect(r.every((x) => x.date === '2027-06-12')).toBe(true)

    const section = b.nodes.find((n) => n.type === 'section')!
    const due = { ...b, nodes: b.nodes.map((n) => (n.id === section.id && n.type === 'section' ? { ...n, items: n.items.map((i) => ({ ...i, paid: false, due: '2027-05-01' })) } : n)) }
    expect(upcoming(due, '2027-05-01', '2027-05-01').map((x) => x.what)).toContain('Payment due')
  })
})
