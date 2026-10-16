import { BOOKING_KINDS } from './catalog'
import { addDays, toIso } from './dates'
import type { Board } from './model.gen'

/** Same rules as `crates/core/src/reminders.rs`, which mails the daily digest. */
export interface Reminder {
  key: string
  nodeId: string
  date: string
  time: string
  what: string
  title: string
  icon: string
}

/** Dated events from `from` to `until` (ISO, inclusive), soonest first. */
export function upcoming(board: Board, from: string, until: string): Reminder[] {
  const out: Reminder[] = []
  const push = (nodeId: string, tag: string, date: string, time: string, what: string, title: string, icon: string) => {
    if (date.length === 10 && date >= from && date <= until) out.push({ key: `${nodeId}:${tag}:${date}`, nodeId, date, time, what, title, icon })
  }
  for (const n of board.nodes) {
    if (n.type === 'booking') {
      const k = BOOKING_KINDS[n.kind]
      push(n.id, 's', n.startDate, n.startTime, k.start, n.title, k.icon)
      if (n.endDate !== n.startDate) push(n.id, 'e', n.endDate, n.endTime, k.end, n.title, k.icon)
    } else if (n.type === 'itinerary') {
      push(n.id, 'd', n.date, n.stops.find((s) => s.time)?.time ?? '', 'Day plan', n.title, 'calendar-dots')
    } else if (n.type === 'section') {
      for (const i of n.items) if (!i.paid) push(n.id, i.id, i.due, '', 'Payment due', i.text || n.title, 'coins')
    }
  }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

/** What the bell lists: the next two weeks. */
export const BELL_DAYS = 14

export const soon = (board: Board, now = new Date()) => upcoming(board, toIso(now), addDays(toIso(now), BELL_DAYS))

/** Milliseconds until an event starts (its time, or 9:00 on its day). */
export function msUntil(r: Reminder, now = Date.now()): number {
  return new Date(`${r.date}T${r.time || '09:00'}:00`).getTime() - now
}
