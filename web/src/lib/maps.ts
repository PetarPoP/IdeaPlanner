export interface MapView {
  /** Embeddable iframe URL, when the input could be turned into one. */
  src?: string
  /** Why there is no map, shown in its place. */
  msg?: string
  /** Stops recognised in the input, shown as A, B, C chips. */
  stops: string[]
  /** Link that opens the same thing in Google Maps. */
  open: string
}

const enc = encodeURIComponent
const decodeSegment = (x: string) => {
  try {
    return decodeURIComponent(x.replace(/\+/g, ' '))
  } catch {
    return x
  }
}
const dirEmbed = (p: string[]) =>
  `https://maps.google.com/maps?saddr=${enc(p[0]!)}&daddr=${p.slice(1).map(enc).join('+to:')}&output=embed`
export const dirLink = (p: string[]) => `https://www.google.com/maps/dir/${p.map(enc).join('/')}`
const placeEmbed = (q: string) => `https://maps.google.com/maps?q=${enc(q)}&output=embed`

/**
 * Turns what people paste into the map card (a Google Maps URL, an embed
 * snippet, or plain stops like "Lisbon → Sintra → Lagos") into an embed.
 */
export function parseMapInput(input: string): MapView {
  const s = input.trim()
  if (!s) {
    return {
      msg: 'Paste your Google Maps route below, or type stops like Lisbon → Sintra → Lagos.',
      stops: [],
      open: 'https://www.google.com/maps',
    }
  }

  const embedSrc = s.match(/src="([^"]+)"/)?.[1]
  if (embedSrc) return isGoogleMaps(embedSrc) ? { src: embedSrc, stops: [], open: embedSrc.replace('/embed', '') } : unreadable(s)
  if (/google\.[^/]+\/maps\/embed/.test(s)) return { src: s, stops: [], open: s }
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/.test(s)) {
    return {
      msg: 'Short share links can’t be embedded. Use the full URL from the address bar, or Share → Embed a map.',
      stops: [],
      open: s,
    }
  }

  const dir = s.match(/\/maps\/dir\/([^?@]+)/)?.[1]
  if (dir) {
    const p = dir.split('/').filter(Boolean).map(decodeSegment)
    if (p.length >= 2) return { src: dirEmbed(p), stops: p, open: s }
  }
  const place = s.match(/\/maps\/place\/([^/@?]+)/)?.[1]
  if (place) {
    const q = decodeSegment(place)
    return { src: placeEmbed(q), stops: [q], open: s }
  }
  if (/^https?:/i.test(s)) {
    const q = s.match(/[?&]q=([^&]+)/)?.[1]
    return q ? { src: placeEmbed(decodeSegment(q)), stops: [], open: s } : unreadable(s)
  }

  const p = s.split(/→|->|;|\n/).map((x) => x.trim()).filter(Boolean)
  if (p.length >= 2) return { src: dirEmbed(p), stops: p, open: dirLink(p) }
  return { src: placeEmbed(s), stops: [s], open: `https://www.google.com/maps/search/?api=1&query=${enc(s)}` }
}

function isGoogleMaps(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && /(^|\.)google\.[a-z.]+$/.test(u.hostname)
  } catch {
    return false
  }
}

function unreadable(s: string): MapView {
  return { msg: 'Couldn’t read that link. Try Share → Embed a map and paste the code.', stops: [], open: s }
}
