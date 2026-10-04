import type { Board, Node } from './model.gen'
import { looseToIso } from './dates'

type Loose<T> = { [K in keyof T]?: T[K] } & Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * Fills fields added since a board was saved, so older boards (on a device or
 * on the server) open without missing values. Mirrors the `serde(default)`s in
 * crates/core.
 */
export function normalizeBoard(raw: Loose<Board>): Board {
  const date = str(raw.date)
  const year = Number(date.slice(0, 4)) || new Date().getFullYear()
  const nodes = (raw.nodes ?? []).map((n) => normalizeNode(n as Loose<Node>, year))
  return {
    ...(raw as Board),
    date,
    endDate: str(raw.endDate),
    place: str(raw.place),
    cap: str(raw.cap),
    nodes,
    edges: raw.edges ?? [],
    strokes: (raw.strokes ?? []).map((s) => ({ ...s, color: str(s.color) })),
    activity: raw.activity ?? [],
  }
}

function normalizeNode(n: Loose<Node>, year: number): Node {
  if (n.type === 'itinerary') return { ...n, date: looseToIso(str(n.date), year) } as Node
  if (n.type === 'booking') {
    const { when, ...rest } = n as Loose<Extract<Node, { type: 'booking' }>> & { when?: unknown }
    // Old bookings had one free-text "when" ("Jun 12 · 07:05").
    const [d = '', t = ''] = str(when).split('·').map((x) => x.trim())
    return {
      ...rest,
      startDate: str(rest.startDate) || looseToIso(d, year),
      startTime: str(rest.startTime) || (/^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, '0') : ''),
      endDate: str(rest.endDate),
      endTime: str(rest.endTime),
    } as Node
  }
  return n as Node
}
