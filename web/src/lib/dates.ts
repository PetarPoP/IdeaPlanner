const DAY = 864e5
const ISO = /^\d{4}-\d{2}-\d{2}$/

export const isIsoDate = (v: string) => ISO.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime())

/** Local midnight of an ISO date, or null. */
export function parseIso(iso: string): Date | null {
  return isIsoDate(iso) ? new Date(`${iso}T00:00:00`) : null
}

export function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso)
  if (!d) return iso
  d.setDate(d.getDate() + n)
  return toIso(d)
}

/** Whole days from `a` to `b` (both ISO). */
export function daysBetween(a: string, b: string): number | null {
  const x = parseIso(a)
  const y = parseIso(b)
  return x && y ? Math.round((y.getTime() - x.getTime()) / DAY) : null
}

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', o)

/** "Sat, Jun 12" */
export function dayLabel(iso: string): string {
  const d = parseIso(iso)
  return d ? fmt(d, { weekday: 'short', month: 'short', day: 'numeric' }) : ''
}

/** "Jun 12 – 19, 2027", "Dec 28, 2026 – Jan 3, 2027", or "" without a start. */
export function rangeLabel(start: string, end: string): string {
  const a = parseIso(start)
  if (!a) return ''
  const b = parseIso(end)
  if (!b || b.getTime() <= a.getTime()) return fmt(a, { month: 'short', day: 'numeric', year: 'numeric' })
  if (a.getFullYear() !== b.getFullYear())
    return `${fmt(a, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(b, { month: 'short', day: 'numeric', year: 'numeric' })}`
  if (a.getMonth() !== b.getMonth())
    return `${fmt(a, { month: 'short', day: 'numeric' })} – ${fmt(b, { month: 'short', day: 'numeric' })}, ${b.getFullYear()}`
  return `${fmt(a, { month: 'short', day: 'numeric' })} – ${b.getDate()}, ${b.getFullYear()}`
}

/** "in 251 days", "tomorrow", "today", "day 2 of 7", "ended", relative to `now`. */
export function countdown(start: string, end: string, now = new Date()): string {
  const today = toIso(now)
  const toStart = daysBetween(today, start)
  if (toStart == null) return ''
  if (toStart > 1) return `in ${toStart} days`
  if (toStart === 1) return 'tomorrow'
  if (toStart === 0) return 'today'
  const last = isIsoDate(end) && end > start ? end : start
  const toEnd = daysBetween(today, last)!
  if (toEnd < 0) return 'ended'
  return `day ${1 - toStart} of ${daysBetween(start, last)! + 1}`
}

/** "Jun 12 – 19, 2027 · in 251 days", for the board header. */
export function dateLabel(start: string, end = '', now = new Date()): string {
  const r = rangeLabel(start, end)
  if (!r) return 'Add dates'
  const c = countdown(start, end, now)
  return c ? `${r} · ${c}` : r
}

/**
 * Best-effort ISO date from loose text ("Sat, Jun 12" + a year, "12.6.2027"),
 * for boards saved before dates were pickers. Empty when unreadable.
 */
export function looseToIso(text: string, year: number): string {
  const v = text.trim()
  if (!v) return ''
  if (isIsoDate(v)) return v
  const dmy = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v)
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    return Number.isNaN(d.getTime()) ? '' : toIso(d)
  }
  const cleaned = v.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i, '')
  // Needs a day number; Date() would read "someday 2027" as Jan 1.
  if (!/\d/.test(cleaned)) return ''
  const d = new Date(/\d{4}/.test(cleaned) ? cleaned : `${cleaned} ${year}`)
  return Number.isNaN(d.getTime()) ? '' : toIso(d)
}

export function timeAgo(t: number, now = Date.now()): string {
  const s = (now - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
