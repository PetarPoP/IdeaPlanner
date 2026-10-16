import type { Board, Node } from './model.gen'
import { BOOKING_KINDS } from './catalog'
import { addDays, isIsoDate } from './dates'
import { num } from './money'

type Booking = Extract<Node, { type: 'booking' }>
type Itinerary = Extract<Node, { type: 'itinerary' }>

export interface PlanItem {
  key: string
  node: Itinerary | Booking
  time: string
  /** For bookings: the end of it (check-out, return…). */
  end?: boolean
}

/** Day plans and booking starts/ends grouped by date, in time order; what has no date comes last. */
export function planByDay(board: Board): { days: Array<{ date: string; items: PlanItem[] }>; undated: Array<Itinerary | Booking> } {
  const byDate = new Map<string, PlanItem[]>()
  const undated: Array<Itinerary | Booking> = []
  const put = (date: string, item: PlanItem) => byDate.set(date, [...(byDate.get(date) ?? []), item])
  for (const n of board.nodes) {
    if (n.type === 'itinerary') {
      if (isIsoDate(n.date)) put(n.date, { key: n.id, node: n, time: n.stops.find((s) => s.time)?.time ?? '' })
      else undated.push(n)
    } else if (n.type === 'booking') {
      if (!isIsoDate(n.startDate)) undated.push(n)
      else {
        put(n.startDate, { key: `${n.id}:s`, node: n, time: n.startTime })
        if (isIsoDate(n.endDate) && n.endDate !== n.startDate) put(n.endDate, { key: `${n.id}:e`, node: n, time: n.endTime, end: true })
      }
    }
  }
  const days = [...byDate.keys()].sort().map((date) => ({
    date,
    items: byDate.get(date)!.sort((a, b) => (a.time || '99').localeCompare(b.time || '99')),
  }))
  return { days, undated }
}

/** `"my-trip.csv"` from the board title. */
export function fileName(board: Pick<Board, 'title'>, ext: string): string {
  const slug = board.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return `${slug || 'idea-planner'}.${ext}`
}

// ---------------------------------------------------------------- CSV

/** One RFC 4180 field; text a spreadsheet would run as a formula is prefixed with `'`. */
function csvField(v: string, text = true): string {
  const safe = text && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

const amount = (v: string) => (v.trim() ? String(num(v)) : '')

export const bookingLabel = (n: Booking) => [BOOKING_KINDS[n.kind].start, [n.from, n.to].filter(Boolean).join(' → ')].filter(Boolean).join(' ')

/** Every cost line on the board: cost items, day-plan stops and bookings that have a cost. */
export function costsCsv(board: Board): string {
  const rows: string[][] = []
  const payer = (paid: boolean, i: number) => (paid ? (board.people[i]?.name ?? '') : '')
  for (const n of board.nodes) {
    const card = n.title || 'Untitled'
    if (n.type === 'section') {
      for (const i of n.items) {
        if (!i.text.trim() && !i.cost.trim()) continue
        rows.push([card, i.text, amount(i.cost), i.cur || board.cur, payer(i.paid, i.payer), i.paid ? 'yes' : 'no'])
      }
    } else if (n.type === 'itinerary') {
      for (const s of n.stops) {
        if (!s.cost.trim()) continue
        rows.push([card, [s.time, s.place].filter(Boolean).join(' '), amount(s.cost), board.cur, '', 'no'])
      }
    } else if (n.type === 'booking' && n.cost.trim()) {
      rows.push([card, bookingLabel(n), amount(n.cost), n.cur || board.cur, payer(n.paid, n.payer), n.paid ? 'yes' : 'no'])
    }
  }
  const head = ['Card', 'Item', 'Amount', 'Currency', 'Paid by', 'Paid']
  return [head, ...rows].map((r) => r.map((v, i) => csvField(v, i !== 2)).join(',')).join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------- iCalendar

/** TEXT value escaping (RFC 5545 §3.3.11). */
export const icsText = (v: string) =>
  v
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n|\r/g, '\\n')

const utf8 = new TextEncoder()

/** Folds a content line at 75 octets, never inside a UTF-8 character (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  const out: string[] = []
  let cur = ''
  let size = 0
  for (const ch of line) {
    const n = utf8.encode(ch).length
    // Continuation lines start with a space, which counts toward their 75.
    if (size + n > 75) {
      out.push(cur)
      cur = ' '
      size = 1
    }
    cur += ch
    size += n
  }
  out.push(cur)
  return out.join('\r\n')
}

const compact = (iso: string) => iso.replace(/-/g, '')

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

interface IcsEvent {
  uid: string
  date: string
  time: string
  summary: string
  location?: string
  description?: string
}

function vevent(e: IcsEvent, dtstamp: string): string[] {
  const time = /^\d{2}:\d{2}$/.test(e.time) ? e.time : ''
  return [
    'BEGIN:VEVENT',
    `UID:${e.uid}@ideaplanner`,
    `DTSTAMP:${dtstamp}`,
    // A time without a zone is "floating": the same wall-clock time wherever the trip is.
    ...(time
      ? [`DTSTART:${compact(e.date)}T${time.replace(':', '')}00`]
      : [`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.date, 1))}`]),
    `SUMMARY:${icsText(e.summary)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    'END:VEVENT',
  ]
}

/** Day plans (all-day, stops in the description) and booking starts and ends, as an .ics calendar. */
export function boardIcs(board: Board, now = new Date()): string {
  const events: IcsEvent[] = []
  for (const n of board.nodes) {
    if (n.type === 'itinerary' && isIsoDate(n.date)) {
      const stops = n.stops.filter((s) => s.place || s.time).map((s) => [s.time, s.place].filter(Boolean).join(' '))
      events.push({ uid: n.id, date: n.date, time: '', summary: n.title || 'Day plan', location: board.place, description: stops.join('\n') })
    } else if (n.type === 'booking' && isIsoDate(n.startDate)) {
      const kind = BOOKING_KINDS[n.kind]
      const description = [n.from && `${kind.from}: ${n.from}`, n.to && `${kind.to}: ${n.to}`, n.conf && `Confirmation: ${n.conf}`]
        .filter(Boolean)
        .join('\n')
      const title = n.title || n.kind
      events.push({ uid: n.id, date: n.startDate, time: n.startTime, summary: `${kind.start}: ${title}`, location: n.from, description })
      if (isIsoDate(n.endDate) && (n.endDate !== n.startDate || n.endTime)) {
        // A return flight leaves from the destination; a car is dropped off there.
        const where = n.kind === 'Flight' || n.kind === 'Car' ? n.to : n.from
        events.push({ uid: `${n.id}-end`, date: n.endDate, time: n.endTime, summary: `${kind.end}: ${title}`, location: where, description })
      }
    }
  }
  const dtstamp = stamp(now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Idea Planner//Board export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(board.title || 'Idea Planner')}`,
    ...events.flatMap((e) => vevent(e, dtstamp)),
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
