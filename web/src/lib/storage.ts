import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Board } from './model.gen'

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
}

const LOCAL_PREFIX = 'ideaPlanner.board.'
const LAST_KEY = 'ideaPlanner.lastBoard'

const browserStore: Store = {
  async load(id) {
    return localStorage.getItem(LOCAL_PREFIX + id)
  },
  async save(id, doc) {
    localStorage.setItem(LOCAL_PREFIX + id, doc)
  },
}

const tauriStore: Store = {
  load: (id) => invoke<string | null>('load_board', { id }),
  save: (id, doc) => invoke('save_board', { id, doc }),
}

const deviceStore = (): Store => (isTauri() ? tauriStore : browserStore)

let apiBase: Promise<string | null> | undefined

/** Resolves the server's base URL once, or null when running without one. */
function resolveApi(): Promise<string | null> {
  apiBase ??= (async () => {
    const configured = import.meta.env.VITE_API_URL as string | undefined
    if (configured) return configured.replace(/\/$/, '')
    if (isTauri()) return null
    try {
      // Static hosts answer unknown paths with index.html, so check the body.
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(2500) })
      const body: unknown = res.ok ? await res.json().catch(() => null) : null
      return (body as { service?: string } | null)?.service === 'ideaplanner' ? '' : null
    } catch {
      return null
    }
  })()
  return apiBase
}

const remoteStore = (base: string): Store => ({
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
    return Array.isArray(b.nodes) ? b : null
  } catch {
    return null
  }
}

export type SyncState = 'local' | 'synced' | 'offline'

export async function loadBoard(id: string): Promise<{ board: Board | null; sync: SyncState }> {
  const base = await resolveApi()
  if (base != null) {
    try {
      const remote = parse(await remoteStore(base).load(id))
      if (remote) return { board: remote, sync: 'synced' }
    } catch {
      return { board: parse(await deviceStore().load(id)), sync: 'offline' }
    }
  }
  return { board: parse(await deviceStore().load(id)), sync: base == null ? 'local' : 'synced' }
}

export async function saveBoard(board: Board): Promise<SyncState> {
  const doc = JSON.stringify(board)
  await deviceStore().save(board.id, doc)
  const base = await resolveApi()
  if (base == null) return 'local'
  try {
    await remoteStore(base).save(board.id, doc)
    return 'synced'
  } catch {
    return 'offline'
  }
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
