const DAY = 864e5

/** "Jun 12, 2027 · in 251 days" for an ISO date, relative to `now`. */
export function dateLabel(iso: string, now = new Date()): string {
  if (!iso) return 'No date'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return 'No date'
  const days = Math.ceil((d.getTime() - now.getTime()) / DAY)
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return days > 0 ? `${label} · in ${days} days` : label
}

export function timeAgo(t: number, now = Date.now()): string {
  const s = (now - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
