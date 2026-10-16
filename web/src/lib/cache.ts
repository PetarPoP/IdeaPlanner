/**
 * Small lookup cache for the keyless web APIs (places, weather, travel):
 * kept in memory, mirrored to localStorage, capped by dropping the least
 * recently used entries, with concurrent lookups of one key shared.
 */

interface Entry<T> {
  v: T
  /** Expiry (Unix ms); absent means never. */
  x?: number
}

export interface Cache<T> {
  /** The cached value, or undefined when unknown or expired. */
  peek(key: string): T | undefined
  set(key: string, value: T, ttlMs?: number): void
  /** Cached value, else the lookup already running for `key`, else a new one. Failures are not cached. */
  get(key: string, run: () => Promise<T>, ttlFor?: (value: T) => number | undefined): Promise<T>
}

/** Drops expired entries, then the oldest ones beyond `cap` (Map order is use order). */
export function evict<T>(m: Map<string, Entry<T>>, cap: number, now = Date.now()) {
  for (const [k, e] of m) if (e.x != null && e.x <= now) m.delete(k)
  for (const k of m.keys()) {
    if (m.size <= cap) break
    m.delete(k)
  }
}

export function createCache<T>(storageKey: string | null, cap = 300): Cache<T> {
  let mem: Map<string, Entry<T>> | null = null
  const inflight = new Map<string, Promise<T>>()
  let saving: ReturnType<typeof setTimeout> | null = null

  const load = () => {
    if (mem) return mem
    mem = new Map()
    try {
      const raw = storageKey ? localStorage.getItem(storageKey) : null
      if (raw) for (const [k, e] of JSON.parse(raw) as Array<[string, Entry<T>]>) mem.set(k, e)
    } catch {
      // No storage (tests, private mode) or a corrupt copy: start empty.
    }
    evict(mem, cap)
    return mem
  }

  const save = () => {
    if (!storageKey || saving) return
    saving = setTimeout(() => {
      saving = null
      try {
        localStorage.setItem(storageKey, JSON.stringify([...load()]))
      } catch {
        // Storage full or blocked; the memory copy still works.
      }
    }, 500)
  }

  const peek = (key: string) => {
    const m = load()
    const e = m.get(key)
    if (!e) return undefined
    if (e.x != null && e.x <= Date.now()) {
      m.delete(key)
      return undefined
    }
    m.delete(key)
    m.set(key, e)
    return e.v
  }

  const set = (key: string, v: T, ttlMs?: number) => {
    const m = load()
    m.delete(key)
    m.set(key, ttlMs == null ? { v } : { v, x: Date.now() + ttlMs })
    evict(m, cap)
    save()
  }

  return {
    peek,
    set,
    get(key, run, ttlFor) {
      const hit = peek(key)
      if (hit !== undefined) return Promise.resolve(hit)
      const running = inflight.get(key)
      if (running) return running
      const p = run()
        .then((v) => {
          set(key, v, ttlFor?.(v))
          return v
        })
        .finally(() => inflight.delete(key))
      inflight.set(key, p)
      return p
    },
  }
}

/** GET a JSON API; throws on network errors and non-2xx answers. */
export async function getJson<T>(url: string): Promise<T> {
  const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(12_000) : undefined
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return (await res.json()) as T
}
