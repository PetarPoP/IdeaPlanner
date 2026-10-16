import type { Board } from './model.gen'
import { foreignCurrencies } from './budget'

/** ISO codes for the symbols people type on costs. */
const ISO: Record<string, string> = {
  '€': 'EUR',
  $: 'USD',
  '£': 'GBP',
  '¥': 'JPY',
  din: 'RSD',
  дин: 'RSD',
  kn: 'EUR', // Croatia moved to the euro in 2023.
  zł: 'PLN',
  Kč: 'CZK',
  Ft: 'HUF',
  kr: 'SEK',
  lei: 'RON',
  '₺': 'TRY',
  CHF: 'CHF',
}

export const isoOf = (cur: string): string | null => {
  const c = cur.trim()
  return ISO[c] ?? (/^[A-Z]{3}$/i.test(c) ? c.toUpperCase() : null)
}

/** Refresh at most this often. */
export const RATES_TTL_MS = 12 * 3600_000

/** Whether the board uses a currency it has no fresh rate for. */
export function needsRates(board: Board, now = Date.now()): boolean {
  const foreign = foreignCurrencies(board).filter((c) => isoOf(c))
  if (!foreign.length) return false
  return now - board.ratesAt > RATES_TTL_MS || foreign.some((c) => !(c in board.rates))
}

/**
 * What one unit of each foreign currency is worth in the board's currency,
 * from open.er-api.com (free, no key, daily rates).
 */
export async function fetchRates(board: Board): Promise<Record<string, number> | null> {
  const base = isoOf(board.cur)
  if (!base) return null
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const body = (await res.json()) as { result?: string; rates?: Record<string, number> }
  if (body.result !== 'success' || !body.rates) return null
  const out: Record<string, number> = {}
  for (const cur of foreignCurrencies(board)) {
    const iso = isoOf(cur)
    const perBase = iso ? body.rates[iso] : undefined
    if (perBase) out[cur] = 1 / perBase
  }
  return out
}
