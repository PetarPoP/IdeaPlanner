import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Board, BoardSummary } from './model.gen'
import { normalizeBoard } from './normalize'

/**
 * Where boards live:
 * - on device: SQLite through the Tauri backend, or localStorage in a browser;
 * - remotely: the Axum server, when the page was served by it or
 *   `VITE_API_URL` points at it. Remote is the source of truth when reachable
 *   (that is what makes share links work); the device copy keeps the board
 *   usable offline.
 */

interface Store {
  load(id: string): Promise<string | null>
  save(id: string, doc: string): Promise<void>
  list(): Promise<BoardSummary[]>
  remove(id: string): Promise<void>
}

const LOCAL_PREFIX = 'ideaPlanner.board.'
const INDEX_KEY = 'ideaPlanner.index'
const META_KEY = 'ideaPlanner.meta'
const LAST_KEY = 'ideaPlanner.lastBoard'

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked; the list is rebuilt from boards next time.
  }
}

const summaryOf = (b: Board): BoardSummary => ({ id: b.id, title: b.title, icon: b.icon, date: b.date, endDate: b.endDate, updatedAt: Date.now() })

const browserStore: Store = {
  async load(id) {
    return localStorage.getItem(LOCAL_PREFIX + id)
  },
  async save(id, doc) {
    localStorage.setItem(LOCAL_PREFIX + id, doc)
    const b = parse(doc)
    if (b) writeJson(INDEX_KEY, [summaryOf(b), ...readJson<BoardSummary[]>(INDEX_KEY, []).filter((x) => x.id !== id)])
  },
  async list() {
    const index = readJson<BoardSummary[]>(INDEX_KEY, [])
    // Boards saved before the index existed.
    const known = new Set(index.map((x) => x.id))
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      const id = key?.startsWith(LOCAL_PREFIX) ? key.slice(LOCAL_PREFIX.length) : null
      const b = id && !known.has(id) ? parse(localStorage.getItem(key!)) : null
      if (b) index.push({ ...summaryOf(b), updatedAt: 0 })
    }
    return index
  },
  async remove(id) {
    localStorage.removeItem(LOCAL_PREFIX + id)
    writeJson(
      INDEX_KEY,
      readJson<BoardSummary[]>(INDEX_KEY, []).filter((x) => x.id !== id),
    )
  },
}

const tauriStore: Store = {
  load: (id) => invoke<string | null>('load_board', { id }),
  save: (id, doc) => invoke('save_board', { id, doc }),
  list: () => invoke<BoardSummary[]>('list_boards'),
  remove: (id) => invoke('delete_board', { id }),
}

const deviceStore = (): Store => (isTauri() ? tauriStore : browserStore)

interface Api {
  base: string
  /** Domain of the board email addresses, when the server has an inbox. */
  inboxDomain: string | null
}

let api: Promise<Api | null> | undefined

async function health(base: string): Promise<Api | null> {
  // Static hosts answer unknown paths with index.html, so check the body.
  const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2500) })
  const body = (res.ok ? await res.json().catch(() => null) : null) as { service?: string; inboxDomain?: string | null } | null
  return body?.service === 'ideaplanner' ? { base, inboxDomain: body.inboxDomain ?? null } : null
}

/** Finds the server once, or null when running without one. */
function resolveApi(): Promise<Api | null> {
  api ??= (async () => {
    const configured = import.meta.env.VITE_API_URL as string | undefined
    if (configured) {
      const base = configured.replace(/\/$/, '')
      return health(base).catch(() => ({ base, inboxDomain: null }))
    }
    // Only a build served by the Rust server has an API next to it; the Vite
    // dev server and Tauri never do, so don't probe (a slow probe there is
    // aborted and the dev server logs it as an error).
    if (isTauri() || import.meta.env.DEV) return null
    return health('').catch(() => null)
  })()
  return api
}

export async function inboxDomain(): Promise<string | null> {
  return (await resolveApi())?.inboxDomain ?? null
}

const remoteStore = (base: string): Pick<Store, 'load' | 'save'> => ({
  async load(id) {
    const res = await fetch(`${base}/api/boards/${encodeURIComponent(id)}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`load failed: ${res.status}`)
    return res.text()
  },
  async save(id, doc) {
    const res = await fetch(`${base}/api/boards/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: doc,
    })
    if (!res.ok) throw new Error(`save failed: ${res.status}`)
  },
})

function parse(doc: string | null): Board | null {
  if (!doc) return null
  try {
    const b = JSON.parse(doc) as Board
    return Array.isArray(b.nodes) ? normalizeBoard(b) : null
  } catch {
    return null
  }
}

export type SyncState = 'local' | 'synced' | 'offline'

export async function loadBoard(id: string): Promise<{ board: Board | null; sync: SyncState }> {
  const server = await resolveApi()
  const device = parse(await deviceStore().load(id))
  if (server) {
    try {
      const remote = parse(await remoteStore(server.base).load(id))
      if (remote) {
        // Opened from someone else's link: list it under "Shared with me".
        if (!device) setMeta(id, { shared: true })
        return { board: remote, sync: 'synced' }
      }
    } catch {
      return { board: device, sync: 'offline' }
    }
  }
  return { board: device, sync: server ? 'synced' : 'local' }
}

export async function saveBoard(board: Board): Promise<SyncState> {
  const doc = JSON.stringify(board)
  await deviceStore().save(board.id, doc)
  notifyBoards()
  const server = await resolveApi()
  if (!server) return 'local'
  try {
    await remoteStore(server.base).save(board.id, doc)
    return 'synced'
  } catch {
    return 'offline'
  }
}

/** Per-device facts about a board that are not part of the document. */
export interface BoardMeta {
  shared?: boolean
  /** When it was moved to the trash (Unix ms). */
  trashedAt?: number
}

export type BoardEntry = BoardSummary & BoardMeta

const BOARDS_EVENT = 'ideaplanner:boards'
const notifyBoards = () => window.dispatchEvent(new Event(BOARDS_EVENT))

/** Calls `fn` whenever the board list may have changed. */
export function onBoardsChanged(fn: () => void): () => void {
  window.addEventListener(BOARDS_EVENT, fn)
  return () => window.removeEventListener(BOARDS_EVENT, fn)
}

function setMeta(id: string, patch: BoardMeta | null) {
  const all = readJson<Record<string, BoardMeta>>(META_KEY, {})
  if (patch) all[id] = { ...all[id], ...patch }
  else delete all[id]
  writeJson(META_KEY, all)
  notifyBoards()
}

/** Every board on this device, most recently changed first. */
export async function listBoards(): Promise<BoardEntry[]> {
  const meta = readJson<Record<string, BoardMeta>>(META_KEY, {})
  const list = await deviceStore().list()
  return list.map((b) => ({ ...b, ...meta[b.id] })).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function trashBoard(id: string) {
  setMeta(id, { trashedAt: Date.now() })
  if (lastBoardId() === id) localStorage.removeItem(LAST_KEY)
}
export const restoreBoard = (id: string) => setMeta(id, { trashedAt: undefined })

/** Removes the device copy for good (a shared board stays on the server). */
export async function deleteBoard(id: string) {
  await deviceStore().remove(id)
  setMeta(id, null)
  if (lastBoardId() === id) localStorage.removeItem(LAST_KEY)
}

export function lastBoardId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

export function rememberBoard(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id)
  } catch {
    // Private mode: nothing to remember.
  }
}

/**
 * The link people open to join this board, or null when this build has no
 * web address to point at (a desktop/mobile build without VITE_PUBLIC_URL).
 */
export function shareUrl(id: string): string | null {
  const base = (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? (isTauri() ? null : window.location.origin)
  return base ? `${base.replace(/\/$/, '')}/b/${id}` : null
}
