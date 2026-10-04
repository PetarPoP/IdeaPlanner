/** The fields an email card shows. */
export interface MailFields {
  from: string
  to: string
  subject: string
  date: string
  body: string
}

const MAX_BODY = 4000

/** Reads `=?utf-8?B?…?=` / `=?utf-8?Q?…?=` encoded words in headers. */
function decodeWords(v: string): string {
  return v.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, enc: string, text: string) => {
    try {
      const bytes =
        enc.toUpperCase() === 'B'
          ? Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
          : qpBytes(text.replace(/_/g, ' '))
      return new TextDecoder(charset).decode(bytes)
    } catch {
      return text
    }
  })
}

function qpBytes(text: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      out.push(parseInt(text.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      out.push(...new TextEncoder().encode(c))
    }
  }
  return Uint8Array.from(out)
}

function decodeBody(body: string, encoding: string, charset: string): string {
  try {
    if (/base64/i.test(encoding)) return new TextDecoder(charset).decode(Uint8Array.from(atob(body.replace(/\s+/g, '')), (c) => c.charCodeAt(0)))
    if (/quoted-printable/i.test(encoding)) return new TextDecoder(charset).decode(qpBytes(body.replace(/=\r?\n/g, '')))
  } catch {
    // Fall through to the raw text.
  }
  return body
}

interface Part {
  headers: Map<string, string>
  body: string
}

function splitPart(raw: string): Part {
  const text = raw.replace(/\r\n/g, '\n')
  const cut = text.indexOf('\n\n')
  const head = cut < 0 ? text : text.slice(0, cut)
  const headers = new Map<string, string>()
  // Continuation lines start with whitespace.
  for (const line of head.replace(/\n[ \t]+/g, ' ').split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim())
  }
  return { headers, body: cut < 0 ? '' : text.slice(cut + 2) }
}

const param = (header: string, name: string) => new RegExp(`${name}="?([^";]+)"?`, 'i').exec(header)?.[1] ?? ''

/** The best plain-text body of a part, walking into multiparts. */
function textOf(part: Part): string {
  const type = part.headers.get('content-type') ?? 'text/plain'
  const boundary = param(type, 'boundary')
  if (/^multipart\//i.test(type) && boundary) {
    const parts = part.body
      .split(`--${boundary}`)
      .slice(1)
      .filter((p) => !p.startsWith('--'))
      .map((p) => splitPart(p.replace(/^\n/, '')))
    const plain = parts.find((p) => /^text\/plain/i.test(p.headers.get('content-type') ?? 'text/plain'))
    const pick = plain ?? parts.find((p) => /^(multipart|text\/html)/i.test(p.headers.get('content-type') ?? ''))
    return pick ? textOf(pick) : ''
  }
  const body = decodeBody(part.body, part.headers.get('content-transfer-encoding') ?? '', param(type, 'charset') || 'utf-8')
  return /^text\/html/i.test(type) ? htmlToText(body) : body
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'))
  doc.querySelectorAll('p, div, li, tr').forEach((b) => b.append('\n'))
  return doc.body.textContent ?? ''
}

const tidy = (s: string) => s.replace(/\n{3,}/g, '\n\n').trim()

/** True when `text` starts like a raw email (pasted .eml or "show original"). */
export function looksLikeEmail(text: string): boolean {
  const head = splitPart(text.slice(0, 4000)).headers
  return head.has('from') && (head.has('subject') || head.has('to'))
}

/** Parses a raw RFC 822 message (an .eml file) into card fields. */
export function parseEmail(raw: string): MailFields {
  const msg = splitPart(raw)
  const h = (k: string) => decodeWords(msg.headers.get(k) ?? '')
  const body = tidy(textOf(msg))
  return {
    from: h('from'),
    to: h('to'),
    subject: h('subject'),
    date: h('date'),
    body: body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}…` : body,
  }
}

/** "Mon, Oct 4, 09:30" for a header date, or the text as sent. */
export function mailDateLabel(date: string): string {
  const d = new Date(date)
  if (!date || Number.isNaN(d.getTime())) return date
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

/** The address that forwards mail into a board, when the server has an inbox. */
export const inboxAddress = (boardId: string, domain: string | null) => (domain ? `board-${boardId.toLowerCase()}@${domain}` : null)
