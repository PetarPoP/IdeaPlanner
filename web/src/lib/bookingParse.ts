import type { BookingKind, Node } from './model.gen'
import { toIso } from './dates'

type Booking = Extract<Node, { type: 'booking' }>
export type BookingGuess = Partial<Pick<Booking, 'kind' | 'title' | 'from' | 'to' | 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'conf' | 'cost' | 'cur'>>

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function kindOf(text: string): BookingKind {
  const t = text.toLowerCase()
  const score = (words: string[]) => words.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0)
  const scores: Array<[BookingKind, number]> = [
    ['Flight', score(['flight', 'boarding', 'airline', 'departure', 'gate', 'let ', 'aerodrom', 'airport'])],
    ['Stay', score(['check-in', 'check in', 'checkout', 'check-out', 'hotel', 'apartment', 'airbnb', 'booking.com', 'smeštaj', 'nights', 'room'])],
    ['Car', score(['car rental', 'rent a car', 'pick-up', 'pickup', 'drop-off', 'vehicle', 'hertz', 'sixt', 'europcar'])],
    ['Ticket', score(['ticket', 'admission', 'seat', 'concert', 'event', 'museum', 'karta'])],
  ]
  return scores.sort((a, b) => b[1] - a[1])[0]![1] ? scores[0]![0] : 'Ticket'
}

/** Every date in the text, in order, as ISO. Understands 2027-06-12, 12.06.2027, 12/06/2027, 12 Jun 2027, Jun 12, 2027. */
export function findDates(text: string, year = new Date().getFullYear()): string[] {
  const out: Array<[number, string]> = []
  const add = (at: number, y: number, m: number, d: number) => {
    const date = new Date(y, m - 1, d)
    if (date.getMonth() === m - 1 && date.getDate() === d) out.push([at, toIso(date)])
  }
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(m.index, +m[1]!, +m[2]!, +m[3]!)
  for (const m of text.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g)) add(m.index, +m[3]!, +m[2]!, +m[1]!)
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?'
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})\\.?\\s+${mon},?\\s*(\\d{4})?`, 'gi')))
    add(m.index, m[3] ? +m[3] : year, MONTHS.indexOf(m[2]!.toLowerCase()) + 1, +m[1]!)
  for (const m of text.matchAll(new RegExp(`\\b${mon}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b,?\\s*(\\d{4})?`, 'gi')))
    add(m.index, m[3] ? +m[3] : year, MONTHS.indexOf(m[1]!.toLowerCase()) + 1, +m[2]!)
  return [...new Set(out.sort((a, b) => a[0] - b[0]).map((x) => x[1]))]
}

/** A best guess at a booking from a confirmation email, without any server. */
export function guessBooking(subject: string, body: string): BookingGuess | null {
  const text = `${subject}\n${body}`
  const dates = findDates(text)
  const conf = /\b(?:confirmation|booking|reservation|reference|ref|pnr|code)\b[^A-Z0-9\n]{0,24}((?=[A-Z]*\d)[A-Z0-9]{5,12})\b/i.exec(text)?.[1]
  if (!dates.length && !conf) return null

  const kind = kindOf(text)
  const times = [...text.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?!\.\d)/g)].map((m) => `${m[1]!.padStart(2, '0')}:${m[2]}`)
  const cost = /(?:total|price|amount|paid|ukupno|iznos)[^\d€$£\n]{0,24}([€$£])?\s?(\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(€|EUR|USD|\$|£|GBP|RSD|din)?/i.exec(text)
  const route = /\b([A-Z]{3})\s*(?:→|->|–|-|to)\s*([A-Z]{3})\b/.exec(text)
  const flightNo = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/.exec(subject)
  const amount = cost?.[2]?.replace(/[ .](?=\d{3}\b)/g, '').replace(',', '.')
  const sym = cost?.[1] ?? cost?.[3]
  return {
    kind,
    title: (kind === 'Flight' && flightNo ? `${flightNo[1]} ${flightNo[2]}` : subject.replace(/^(re|fwd?):\s*/i, '').slice(0, 60)) || 'Booking',
    from: route?.[1] ?? '',
    to: route?.[2] ?? '',
    startDate: dates[0] ?? '',
    startTime: times[0] ?? '',
    endDate: dates[1] ?? '',
    endTime: times[1] ?? '',
    conf: conf?.toUpperCase() ?? '',
    cost: amount ?? '',
    cur: sym ? ({ EUR: '€', USD: '$', GBP: '£', RSD: 'din' } as Record<string, string>)[sym.toUpperCase()] ?? sym : '',
  }
}
