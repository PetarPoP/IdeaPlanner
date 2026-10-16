import type { Board } from './model.gen'
import type { BoardPatch } from './patch'
import type { Role } from './storage'
import { sessionToken } from './storage'

export interface Peer {
  id: number
  name: string
  color: string
  userId?: string | null
  role: Role
  x?: number | null
  y?: number | null
  /** Cards they have selected. */
  sel?: string[]
}

type ServerMsg =
  | { t: 'welcome'; you: number; role: Role; board: Board; peers: Peer[] }
  | { t: 'ack'; seq: number }
  | { t: 'reject'; seq: number; board: Board }
  | { t: 'patch'; from: number; patch: BoardPatch }
  | { t: 'join'; peer: Peer }
  | { t: 'cursor'; id: number; x: number; y: number }
  | { t: 'sel'; id: number; ids: string[] }
  | { t: 'leave'; id: number }

export interface LiveHandlers {
  /** Joined (or rejoined): the server's copy of the board and who's here. */
  welcome(board: Board, role: Role, peers: Peer[]): void
  /** Someone else's edit. */
  patch(p: BoardPatch): void
  /** The server refused an edit; start over from its copy. */
  reset(board: Board): void
  peer(id: number, update: Partial<Peer> | null): void
  status(s: 'connecting' | 'live' | 'off'): void
}

export const PEER_COLORS = ['#f0b86e', '#7fd1b9', '#f08a8a', '#b9a6ff', '#7cc4f2', '#e7a1d4'] as const

export const colorFor = (key: string) => {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0
  return PEER_COLORS[Math.abs(h) % PEER_COLORS.length]!
}

const CURSOR_EVERY_MS = 50
const MAX_BACKOFF_MS = 15_000

/** One board's live connection; reconnects by itself until closed. */
export class LiveSession {
  private ws: WebSocket | null = null
  private seq = 0
  private closed = false
  private retry = 0
  private lastCursor = 0
  private cursorTimer: ReturnType<typeof setTimeout> | undefined
  open = false

  constructor(
    private readonly base: string,
    private readonly boardId: string,
    private readonly hello: () => { name: string; color: string },
    private readonly on: LiveHandlers,
  ) {
    this.connect()
  }

  private url() {
    const origin = this.base || location.origin
    const token = sessionToken()
    const q = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${origin.replace(/^http/, 'ws')}/api/boards/${encodeURIComponent(this.boardId)}/live${q}`
  }

  private connect() {
    this.on.status('connecting')
    const ws = new WebSocket(this.url())
    this.ws = ws
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', ...this.hello() }))
    ws.onmessage = (e) => {
      let m: ServerMsg
      try {
        m = JSON.parse(e.data as string) as ServerMsg
      } catch {
        return
      }
      switch (m.t) {
        case 'welcome':
          this.open = true
          this.retry = 0
          this.on.welcome(m.board, m.role, m.peers)
          this.on.status('live')
          break
        case 'reject':
          this.on.reset(m.board)
          break
        case 'patch':
          this.on.patch(m.patch)
          break
        case 'join':
          this.on.peer(m.peer.id, m.peer)
          break
        case 'cursor':
          this.on.peer(m.id, { x: m.x, y: m.y })
          break
        case 'sel':
          this.on.peer(m.id, { sel: m.ids })
          break
        case 'leave':
          this.on.peer(m.id, null)
          break
      }
    }
    ws.onclose = () => {
      this.open = false
      this.ws = null
      this.on.status('off')
      if (this.closed) return
      // Back off, so a server that's down isn't hammered.
      const wait = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.retry++)
      setTimeout(() => !this.closed && this.connect(), wait)
    }
  }

  private send(msg: object) {
    if (this.open && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
      return true
    }
    return false
  }

  /** Sends an edit; false when not connected (save it another way). */
  patch(patch: BoardPatch): boolean {
    return this.send({ t: 'patch', seq: ++this.seq, patch })
  }

  /** Where my pointer is on the board, throttled. */
  cursor(x: number, y: number) {
    const now = Date.now()
    clearTimeout(this.cursorTimer)
    if (now - this.lastCursor >= CURSOR_EVERY_MS) {
      this.lastCursor = now
      this.send({ t: 'cursor', x: Math.round(x), y: Math.round(y) })
    } else this.cursorTimer = setTimeout(() => this.cursor(x, y), CURSOR_EVERY_MS)
  }

  selection(ids: string[]) {
    this.send({ t: 'sel', ids })
  }

  close() {
    this.closed = true
    clearTimeout(this.cursorTimer)
    this.ws?.close()
  }
}
