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
/** Boards changed on this device while the server was unreachable. */
const PENDING_KEY = 'ideaPlanner.pendingSync'

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

export interface Api {
  base: string
  /** Domain of the board email addresses, when the server has an inbox. */
  inboxDomain: string | null
  /** What the server offers beyond storing boards. */
  live: boolean
  google: boolean
  ai: boolean
}

const offlineApi = (base: string): Api => ({ base, inboxDomain: null, live: false, google: false, ai: false })

const TOKEN_KEY = 'ideaPlanner.session'

/**
 * Session token for builds that talk to the server from another origin
 * (desktop/mobile, `VITE_API_URL`); the web build uses the HttpOnly cookie.
 */
export function sessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private mode: signed in for this page only (the cookie still works).
  }
}

/** `fetch` against the server with the session attached. */
export function authFetch(base: string, path: string, init: RequestInit = {}): Promise<Response> {
  const token = sessionToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (init.body && typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json')
  return fetch(`${base}${path}`, { ...init, headers, credentials: base ? 'include' : 'same-origin' })
}

/** The server, or null when this build runs without one. */
export const serverApi = (): Promise<Api | null> => resolveApi()

export type Role = 'view' | 'edit' | 'admin'

/** A board the server won't show: sign in first, or no access at all. */
export class AccessError extends Error {
  constructor(readonly kind: 'signin' | 'denied') {
    super(kind)
  }
}

let api: Promise<Api | null> | undefined

async function health(base: string): Promise<Api | null> {
  // Static hosts answer unknown paths with index.html, so check the body.
  const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2500) })
  const body = (res.ok ? await res.json().catch(() => null) : null) as
    | { service?: string; inboxDomain?: string | null; live?: boolean; google?: boolean; ai?: boolean }
    | null
  return body?.service === 'ideaplanner'
    ? { base, inboxDomain: body.inboxDomain ?? null, live: !!body.live, google: !!body.google, ai: !!body.ai }
    : null
}

/** Finds the server once, or null when running without one. */
function resolveApi(): Promise<Api | null> {
  api ??= (async () => {
    const configured = import.meta.env.VITE_API_URL as string | undefined
    if (configured) {
      const base = configured.replace(/\/$/, '')
      return health(base).catch(() => offlineApi(base))
    }
    // Only a build served by the Rust server has an API next to it; the Vite
    // dev server and Tauri never do, so don't probe (a slow probe there is
    // aborted and the dev server logs it as an error).
    // `VITE_DEV_API=1` proxies /api to a local server (see vite.config.ts).
    if (isTauri() || (import.meta.env.DEV && !import.meta.env.VITE_DEV_API)) return null
    return health('').catch(() => {
      // Unreachable (offline start): assume the server is there so saves
      // queue up for it, and probe again next time.
      api = undefined
      return offlineApi('')
    })
  })()
  return api
}

export async function inboxDomain(): Promise<string | null> {
  return (await resolveApi())?.inboxDomain ?? null
}

const accessError = (status: number) => (status === 401 ? new AccessError('signin') : status === 403 ? new AccessError('denied') : null)

const remoteStore = (base: string) => ({
  async load(id: string): Promise<{ doc: string; role: Role } | null> {
    const res = await authFetch(base, `/api/boards/${encodeURIComponent(id)}`)
    if (res.status === 404) return null
    const denied = accessError(res.status)
    if (denied) throw denied
    if (!res.ok) throw new Error(`load failed: ${res.status}`)
    return { doc: await res.text(), role: (res.headers.get('x-board-role') as Role | null) ?? 'edit' }
  },
  async save(id: string, doc: string) {
    const res = await authFetch(base, `/api/boards/${encodeURIComponent(id)}`, { method: 'PUT', body: doc })
    const denied = accessError(res.status)
    if (denied) throw denied
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

export interface Loaded {
  board: Board | null
  sync: SyncState
  /** What I may do on it; device-only boards are always mine to edit. */
  role: Role
  /** Set when the server holds the board but won't show it. */
  blocked?: AccessError['kind']
}

export async function loadBoard(id: string): Promise<Loaded> {
  const server = await resolveApi()
  const device = parse(await deviceStore().load(id))
  if (server && device && isPending(id)) {
    // Edited offline last time: the device copy is newer, send it up.
    return { board: device, sync: await pushRemote(server.base, id, JSON.stringify(device)), role: 'edit' }
  }
  if (server) {
    try {
      const got = await remoteStore(server.base).load(id)
      const remote = parse(got?.doc ?? null)
      if (remote && got) {
        // Opened from someone else's link: list it under "Shared with me".
        if (!device) setMeta(id, { shared: true })
        // Keep a copy for offline use.
        if (got.role !== 'view') await deviceStore().save(id, got.doc).catch(() => undefined)
        return { board: remote, sync: 'synced', role: got.role }
      }
    } catch (e) {
      if (e instanceof AccessError) return { board: null, sync: 'synced', role: 'view', blocked: e.kind }
      return { board: device, sync: 'offline', role: 'edit' }
    }
  }
  return { board: device, sync: server ? 'synced' : 'local', role: 'edit' }
}

/** Saves on the device and, unless a live session already sent it, the server. */
export async function saveBoard(board: Board, opts: { remote?: boolean } = {}): Promise<SyncState> {
  const doc = JSON.stringify(board)
  await deviceStore().save(board.id, doc)
  notifyBoards()
  const server = await resolveApi()
  if (!server) return 'local'
  return opts.remote === false ? 'synced' : pushRemote(server.base, board.id, doc)
}

/** Saves to the server, remembering the board for a retry when that fails. */
async function pushRemote(base: string, id: string, doc: string): Promise<SyncState> {
  try {
    await remoteStore(base).save(id, doc)
    setPending(id, false)
    return 'synced'
  } catch (e) {
    // Refused (signed out, view only) is not a network problem to retry.
    if (e instanceof AccessError) {
      setPending(id, false)
      return 'offline'
    }
    setPending(id, true)
    return 'offline'
  }
}

const isPending = (id: string) => readJson<string[]>(PENDING_KEY, []).includes(id)

function setPending(id: string, on: boolean) {
  const ids = readJson<string[]>(PENDING_KEY, []).filter((x) => x !== id)
  writeJson(PENDING_KEY, on ? [...ids, id] : ids)
}

/**
 * Sends boards saved only on this device to the server. Returns the ids that
 * made it, or null when there turned out to be no server at all.
 */
export async function syncPending(): Promise<string[] | null> {
  const server = await resolveApi()
  const ids = readJson<string[]>(PENDING_KEY, [])
  if (!server) {
    if (ids.length) writeJson(PENDING_KEY, [])
    return null
  }
  const done: string[] = []
  for (const id of ids) {
    const doc = await deviceStore().load(id).catch(() => null)
    if (!doc) setPending(id, false)
    else if ((await pushRemote(server.base, id, doc)) === 'synced') done.push(id)
    else break
  }
  return done
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
