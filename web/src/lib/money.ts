/** Parses a typed amount (`"12,5"`, `"1200"`, `""`) leniently; anything unreadable is 0. */
export function num(v: string | number | null | undefined): number {
  const x = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

/** Keeps only characters that can form an amount while someone is typing. */
export const cleanAmount = (v: string) => v.replace(/[^\d.,]/g, '')

const grouping = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function money(cur: string, v: number): string {
  return cur + grouping.format(Math.round(v))
}
