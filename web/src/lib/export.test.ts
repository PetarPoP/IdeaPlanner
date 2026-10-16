import { describe, expect, it } from 'vitest'
import type { Board, Node } from './model.gen'
import { boardIcs, costsCsv, fileName, foldLine, icsText, planByDay } from './export'
import { fromTemplate } from './templates'

const base = { x: 0, y: 0, w: 280, icon: 'coins', accent: false, color: '', comments: [] }

function board(nodes: Node[]): Board {
  return { ...fromTemplate('roadtrip', { id: 'b1' }), title: 'Lisbon, "finally"', cur: '€', nodes }
}

const nodes: Node[] = [
  {
    ...base,
    id: 'c1',
    title: 'Food, drinks',
    type: 'section',
    budget: '',
    items: [
      { id: 'i1', text: 'Dinner "Ramiro"', cost: '120,5', cur: '', paid: true, payer: 1, due: '' },
      { id: 'i2', text: '=SUM(A1)', cost: '30', cur: '$', paid: false, payer: 0, due: '' },
      { id: 'i3', text: '', cost: '', cur: '', paid: false, payer: 0, due: '' },
    ],
  },
  {
    ...base,
    id: 'd1',
    title: 'Day 1',
    type: 'itinerary',
    date: '2027-06-12',
    stops: [
      { id: 's1', time: '09:00', place: 'Belém; Tower', cost: '10' },
      { id: 's2', time: '13:00', place: 'Lunch', cost: '' },
    ],
  },
  {
    ...base,
    id: 'f1',
    title: 'Flight',
    type: 'booking',
    kind: 'Flight',
    from: 'ZAG',
    to: 'LIS',
    startDate: '2027-06-12',
    startTime: '07:15',
    endDate: '2027-06-19',
    endTime: '',
    conf: 'X1Y2',
    cost: '240',
    cur: '',
    paid: true,
    payer: 0,
  },
  { ...base, id: 'f2', title: 'No date', type: 'booking', kind: 'Car', from: '', to: '', startDate: '', startTime: '', endDate: '', endTime: '', conf: '', cost: '', cur: '', paid: false, payer: 0 },
]

describe('fileName', () => {
  it('slugs the title', () => {
    expect(fileName({ title: 'Ljeto u Splitu — 2027!' }, 'csv')).toBe('ljeto-u-splitu-2027.csv')
    expect(fileName({ title: '  ' }, 'ics')).toBe('idea-planner.ics')
  })
})

describe('costsCsv', () => {
  it('lists every cost line with RFC 4180 quoting', () => {
    const lines = costsCsv(board(nodes)).split('\r\n')
    expect(lines).toEqual([
      'Card,Item,Amount,Currency,Paid by,Paid',
      '"Food, drinks","Dinner ""Ramiro""",120.5,€,Maja,yes',
      `"Food, drinks",'=SUM(A1),30,$,,no`,
      'Day 1,09:00 Belém; Tower,10,€,,no',
      'Flight,Depart ZAG → LIS,240,€,Ana,yes',
      '',
    ])
  })
})

describe('boardIcs', () => {
  const ics = boardIcs(board(nodes), new Date(Date.UTC(2027, 0, 2, 3, 4, 5)))
  const unfolded = ics.replace(/\r\n /g, '')

  it('uses CRLF and wraps events in a calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(3)
  })

  it('writes a day plan as an all-day event with its stops', () => {
    expect(unfolded).toContain('UID:d1@ideaplanner\r\nDTSTAMP:20270102T030405Z\r\nDTSTART;VALUE=DATE:20270612\r\nDTEND;VALUE=DATE:20270613\r\n')
    expect(unfolded).toContain('DESCRIPTION:09:00 Belém\\; Tower\\n13:00 Lunch\r\n')
  })

  it('writes booking starts with a time and ends without one', () => {
    expect(unfolded).toContain('UID:f1@ideaplanner\r\nDTSTAMP:20270102T030405Z\r\nDTSTART:20270612T071500\r\nSUMMARY:Depart: Flight\r\nLOCATION:ZAG\r\n')
    expect(unfolded).toContain('UID:f1-end@ideaplanner\r\nDTSTAMP:20270102T030405Z\r\nDTSTART;VALUE=DATE:20270619\r\nDTEND;VALUE=DATE:20270620\r\nSUMMARY:Return: Flight\r\nLOCATION:LIS\r\n')
    expect(unfolded).not.toContain('f2@ideaplanner')
  })

  it('escapes text values', () => {
    expect(icsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    expect(unfolded).toContain('X-WR-CALNAME:Lisbon\\, "finally"\r\n')
  })
})

describe('planByDay', () => {
  it('groups dated plans and bookings by day in time order', () => {
    const { days, undated } = planByDay(board(nodes))
    expect(days.map((d) => d.date)).toEqual(['2027-06-12', '2027-06-19'])
    expect(days[0]!.items.map((i) => i.key)).toEqual(['f1:s', 'd1'])
    expect(days[1]!.items[0]).toMatchObject({ key: 'f1:e', end: true })
    expect(undated.map((n) => n.id)).toEqual(['f2'])
  })
})

describe('foldLine', () => {
  it('folds at 75 octets without splitting characters', () => {
    const line = `DESCRIPTION:${'é'.repeat(80)}`
    const parts = foldLine(line).split('\r\n')
    const enc = new TextEncoder()
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(enc.encode(p).length).toBeLessThanOrEqual(75)
    for (const p of parts.slice(1)) expect(p.startsWith(' ')).toBe(true)
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line)
    expect(foldLine('SHORT:x')).toBe('SHORT:x')
  })
})
