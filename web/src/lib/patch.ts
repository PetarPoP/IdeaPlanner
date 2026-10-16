import type { Board } from './model.gen'

/**
 * Live edits as patches, the same shape as `crates/core/src/patch.rs`:
 * top-level fields are replaced, and items of the id-keyed lists are
 * upserted or removed one by one, so two people editing different cards both
 * keep their change.
 */
export const LISTS = ['nodes', 'edges', 'strokes'] as const
type ListKey = (typeof LISTS)[number]
type Item = { id: string }

export interface BoardPatch {
  set?: Record<string, unknown>
  upsert?: Partial<Record<ListKey, Item[]>>
  remove?: Partial<Record<ListKey, string[]>>
}

export const isEmptyPatch = (p: BoardPatch) => !p.set && !p.upsert && !p.remove

const isList = (k: string): k is ListKey => (LISTS as readonly string[]).includes(k)

/**
 * The patch that turns `old` into `next`. The store never mutates, so an
 * unchanged field or card is the same object; that keeps this cheap.
 */
export function diff(old: Board, next: Board): BoardPatch {
  const p: BoardPatch = {}
  const a = old as unknown as Record<string, unknown>
  const b = next as unknown as Record<string, unknown>
  for (const key of Object.keys(b)) {
    if (key === 'id' || isList(key) || a[key] === b[key]) continue
    if (JSON.stringify(a[key]) === JSON.stringify(b[key])) continue
    ;(p.set ??= {})[key] = b[key]
  }
  for (const list of LISTS) {
    const before = new Map((old[list] as Item[]).map((x) => [x.id, x]))
    const after = next[list] as Item[]
    const changed = after.filter((x) => before.get(x.id) !== x)
    const ids = new Set(after.map((x) => x.id))
    const gone = [...before.keys()].filter((id) => !ids.has(id))
    if (changed.length) (p.upsert ??= {})[list] = changed
    if (gone.length) (p.remove ??= {})[list] = gone
  }
  return p
}

/** `board` with `p` applied; lists keep their order, new items go last. */
export function applyPatch(board: Board, p: BoardPatch): Board {
  const out = { ...board, ...Object.fromEntries(Object.entries(p.set ?? {}).filter(([k]) => k !== 'id' && !isList(k))) } as Board
  for (const list of LISTS) {
    const remove = new Set(p.remove?.[list] ?? [])
    const upsert = p.upsert?.[list] ?? []
    if (!remove.size && !upsert.length) continue
    const byId = new Map(upsert.map((x) => [x.id, x]))
    const items = (out[list] as Item[]).filter((x) => !remove.has(x.id)).map((x) => byId.get(x.id) ?? x)
    const have = new Set(items.map((x) => x.id))
    ;(out as unknown as Record<string, Item[]>)[list] = [...items, ...upsert.filter((x) => !have.has(x.id))]
  }
  return out
}
