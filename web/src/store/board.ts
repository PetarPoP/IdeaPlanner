import { create } from 'zustand'
import type { Board, Edge, Node } from '~/lib/model.gen'
import type { NodeType } from '~/lib/catalog'
import { KIND_NOUN } from '~/lib/catalog'
import type { Box, View } from '~/lib/geometry'
import { clampZoom, fitView, zoomAt } from '~/lib/geometry'
import { uid } from '~/lib/ids'
import { drawNames } from '~/lib/santa'
import type { TemplateKey } from '~/lib/templates'
import { duplicateCard, fromTemplate, newCard } from '~/lib/templates'
import type { SyncState } from '~/lib/storage'

export type Tool = 'select' | 'hand' | 'pen' | 'erase' | 'connect'
export type Panel = 'budget' | 'tasks' | 'people' | 'activity'
export type Dialog = 'budget' | 'templates' | 'newBoard' | 'shortcuts'
export type ViewMode = 'board' | 'list' | 'costs' | 'timeline'
export type Selection = { nodes: string[] } | { edge: string } | { stroke: string } | null

/** Ids of the selected cards (none when a connection or drawing is selected). */
export const selectedNodes = (sel: Selection): string[] => (sel && 'nodes' in sel ? sel.nodes : [])

/** What Ctrl+C puts on the clipboard. */
export interface CardClip {
  ideaplanner: 1
  nodes: Node[]
  edges: Edge[]
}

export const PEN_COLORS = ['', '#f3f5fe', '#f0b86e', '#7fd1b9', '#f08a8a'] as const

/**
 * How a change enters undo history:
 * - `step`: its own undo step (adding, deleting, toggling…);
 * - `typing`: one step per focused field, however many keystrokes;
 * - `silent`: no step (drag frames, after the drag already took one).
 */
export type ChangeMode = 'step' | 'typing' | 'silent'

const HISTORY_LIMIT = 40
const ACTIVITY_LIMIT = 40
export const MOBILE_MAX = 760

interface State {
  board: Board | null
  sync: SyncState
  past: Board[]
  future: Board[]
  /** Board as it was when the focused field got focus; pushed on its first edit. */
  editBase: Board | null

  view: View
  viewport: { w: number; h: number }
  vw: number
  /** Rendered card sizes, measured by the canvas. */
  sizes: Record<string, { w: number; h: number }>

  tool: Tool
  penColor: string
  sel: Selection
  connectFrom: string | null
  panel: Panel | null
  dialog: Dialog | null
  addOpen: boolean
  sidebar: boolean
  mode: ViewMode
}

interface Actions {
  hydrate(board: Board, sync: SyncState): void
  setSync(sync: SyncState): void
  change(fn: (b: Board) => Board, mode?: ChangeMode): void
  updateNode(id: string, fn: (n: Node) => Node, mode?: ChangeMode): void
  beginEdit(): void
  endEdit(): void
  undo(): void
  redo(): void
  log(msg: string): void

  addNode<T extends NodeType>(type: T, at?: { x: number; y: number }, patch?: Partial<Extract<Node, { type: T }>>): string
  deleteSelection(): void
  duplicateSelection(): void
  selectAll(): void
  /** Moves the selected cards by (dx, dy) board units. */
  nudge(dx: number, dy: number): void
  copySelection(): CardClip | null
  /** Adds copied cards with fresh ids, their top-left corner at `at` (or offset from the originals). */
  paste(clip: CardClip, at?: { x: number; y: number }): void
  /** Deletes drawings within `r` of (x, y); returns whether any went. */
  eraseAt(x: number, y: number, r: number): boolean
  addEdge(from: string, to: string): void
  /** Shows `input` on the map card linked to `fromId` (or the first map, or a new one). */
  pushToMap(fromId: string, input: string, what: string): void
  drawNames(id: string): void
  applyTemplate(key: TemplateKey, name: string): void

  set(patch: Partial<State>): void
  togglePanel(panel: Panel): void
  toggleDialog(dialog: Dialog): void
  setMode(mode: ViewMode): void
  setTool(tool: Tool): void
  select(sel: Selection): void
  setView(view: View): void
  zoomBy(factor: number): void
  fit(): void
  focusNode(id: string): void
  setSize(id: string, w: number, h: number): void
}

export type BoardStore = State & Actions

export const isMobileWidth = (vw: number) => vw < MOBILE_MAX

const MODE_KEY = 'ideaPlanner.view'
const MODES: readonly ViewMode[] = ['board', 'list', 'costs', 'timeline']

function readMode(): ViewMode {
  try {
    const m = localStorage.getItem(MODE_KEY) as ViewMode | null
    return m && MODES.includes(m) ? m : 'board'
  } catch {
    return 'board'
  }
}

/** Distance from (x, y) to the segment a–b. */
function segDist(x: number, y: number, a: readonly [number, number], b: readonly [number, number]) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len)) : 0
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy))
}

export function strokeNear(pts: ReadonlyArray<readonly [number, number]>, x: number, y: number, r: number): boolean {
  if (pts.length === 1) return Math.hypot(x - pts[0]![0], y - pts[0]![1]) <= r
  for (let i = 1; i < pts.length; i++) if (segDist(x, y, pts[i - 1]!, pts[i]!) <= r) return true
  return false
}

/** Drops references to people a pasted card's board doesn't have. */
function fitPeople(n: Node, people: number): Node {
  const ok = (i: number) => i < people
  switch (n.type) {
    case 'section':
      return { ...n, items: n.items.map((i) => (ok(i.payer) ? i : { ...i, payer: 0, paid: false })) }
    case 'booking':
      return ok(n.payer) ? n : { ...n, payer: 0, paid: false }
    case 'checklist':
      return { ...n, items: n.items.map((t) => (t.who != null && !ok(t.who) ? { ...t, who: null } : t)) }
    case 'note':
      return { ...n, votes: n.votes.filter(ok) }
    case 'poll':
      return { ...n, options: n.options.map((o) => ({ ...o, votes: o.votes.filter(ok) })) }
    case 'places':
      return { ...n, items: n.items.map((p) => ({ ...p, hearts: p.hearts.filter(ok) })) }
    case 'santa':
      return n.pairs && n.pairs.length > people ? { ...n, pairs: null, revealed: [] } : n
    default:
      return n
  }
}

/** A card's box on the board, using its measured height once known. */
export function nodeBox(n: Node, sizes: State['sizes']): Box {
  const s = sizes[n.id]
  return { x: n.x, y: n.y, w: s?.w ?? n.w, h: s?.h ?? 160 }
}

export const useBoard = create<BoardStore>()((set, get) => {
  const commit = (next: Board, mode: ChangeMode) => {
    const { board, past, editBase } = get()
    if (!board || next === board) return
    if (mode === 'step') {
      set({ board: next, past: [...past.slice(-HISTORY_LIMIT + 1), board], future: [], editBase: null })
    } else if (mode === 'typing' && editBase) {
      set({ board: next, past: [...past.slice(-HISTORY_LIMIT + 1), editBase], future: [], editBase: null })
    } else {
      set({ board: next })
    }
  }

  const screenCenter = () => {
    const { view, viewport } = get()
    return { x: (viewport.w / 2 - view.x) / view.z, y: (viewport.h / 2 - view.y) / view.z }
  }

  return {
    board: null,
    sync: 'local',
    past: [],
    future: [],
    editBase: null,
    view: { x: 40, y: 90, z: 0.8 },
    viewport: { w: 1280, h: 800 },
    vw: typeof window === 'undefined' ? 1280 : window.innerWidth,
    sizes: {},
    tool: 'select',
    penColor: '',
    sel: null,
    connectFrom: null,
    panel: null,
    dialog: null,
    addOpen: false,
    sidebar: false,
    mode: readMode(),

    hydrate: (board, sync) =>
      set({ board, sync, past: [], future: [], editBase: null, sel: null, sizes: {}, connectFrom: null, dialog: null, addOpen: false }),
    setSync: (sync) => set({ sync }),

    change: (fn, mode = 'step') => {
      const b = get().board
      if (b) commit(fn(b), mode)
    },
    updateNode: (id, fn, mode = 'step') =>
      get().change((b) => ({ ...b, nodes: b.nodes.map((n) => (n.id === id ? fn(n) : n)) }), mode),

    beginEdit: () => set({ editBase: get().board }),
    endEdit: () => set({ editBase: null }),

    undo: () => {
      const { past, board, future } = get()
      const prev = past[past.length - 1]
      if (!prev || !board) return
      set({ board: prev, past: past.slice(0, -1), future: [board, ...future], sel: null, editBase: null })
    },
    redo: () => {
      const { past, board, future } = get()
      const next = future[0]
      if (!next || !board) return
      set({ board: next, future: future.slice(1), past: [...past, board], sel: null, editBase: null })
    },

    log: (msg) =>
      get().change(
        (b) => ({ ...b, activity: [{ who: 'You', msg, t: Date.now() }, ...b.activity].slice(0, ACTIVITY_LIMIT) }),
        'silent',
      ),

    addNode: (type, at, patch) => {
      const card = newCard(type)
      const c = at ?? screenCenter()
      const jitter = at ? 0 : (Math.random() - 0.5) * 60
      const node = { ...card, ...patch, x: Math.round(c.x - card.w / 2 + jitter), y: Math.round(c.y - 80 + jitter) } as Node
      get().change((b) => ({ ...b, nodes: [...b.nodes, node] }))
      set({ sel: { nodes: [node.id] }, tool: 'select', addOpen: false })
      get().log(`added a ${KIND_NOUN[type] ?? type}`)
      return node.id
    },

    deleteSelection: () => {
      const sel = get().sel
      if (!sel) return
      const nodeIds = new Set(selectedNodes(sel))
      const edgeId = 'edge' in sel ? sel.edge : null
      const strokeId = 'stroke' in sel ? sel.stroke : null
      get().change((b) => ({
        ...b,
        nodes: nodeIds.size ? b.nodes.filter((n) => !nodeIds.has(n.id)) : b.nodes,
        edges: b.edges.filter((e) => e.id !== edgeId && !nodeIds.has(e.from) && !nodeIds.has(e.to)),
        strokes: b.strokes.filter((k) => k.id !== strokeId),
      }))
      set({ sel: null })
      get().log(
        nodeIds.size > 1 ? `deleted ${nodeIds.size} cards` : `deleted a ${nodeIds.size ? 'card' : edgeId ? 'connection' : 'drawing'}`,
      )
    },

    duplicateSelection: () => {
      const clip = get().copySelection()
      if (clip) get().paste(clip)
    },

    selectAll: () => {
      const b = get().board
      if (b) set({ sel: { nodes: b.nodes.map((n) => n.id) }, tool: 'select' })
    },

    nudge: (dx, dy) => {
      const ids = new Set(selectedNodes(get().sel))
      if (!ids.size) return
      get().change((b) => ({ ...b, nodes: b.nodes.map((n) => (ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) }))
    },

    copySelection: () => {
      const { sel, board } = get()
      const ids = new Set(selectedNodes(sel))
      if (!board || !ids.size) return null
      return {
        ideaplanner: 1,
        nodes: board.nodes.filter((n) => ids.has(n.id)),
        edges: board.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
      }
    },

    paste: (clip, at) => {
      const b = get().board
      if (!b || !clip.nodes.length) return
      const x0 = Math.min(...clip.nodes.map((n) => n.x))
      const y0 = Math.min(...clip.nodes.map((n) => n.y))
      const dx = at ? Math.round(at.x - x0) : 40
      const dy = at ? Math.round(at.y - y0) : 40
      const ids = new Map<string, string>()
      const nodes = clip.nodes.map((n) => {
        const c = fitPeople(duplicateCard(n, dx, dy), b.people.length)
        ids.set(n.id, c.id)
        return c
      })
      const edges = clip.edges.flatMap((e) => {
        const from = ids.get(e.from)
        const to = ids.get(e.to)
        return from && to ? [{ id: uid(), from, to }] : []
      })
      get().change((x) => ({ ...x, nodes: [...x.nodes, ...nodes], edges: [...x.edges, ...edges] }))
      set({ sel: { nodes: nodes.map((n) => n.id) }, tool: 'select' })
      get().log(nodes.length > 1 ? `pasted ${nodes.length} cards` : 'pasted a card')
    },

    eraseAt: (x, y, r) => {
      const b = get().board
      if (!b) return false
      const hit = b.strokes.filter((k) => strokeNear(k.pts, x, y, r))
      if (!hit.length) return false
      const gone = new Set(hit.map((k) => k.id))
      get().change((x2) => ({ ...x2, strokes: x2.strokes.filter((k) => !gone.has(k.id)) }), 'silent')
      return true
    },

    addEdge: (from, to) => {
      const b = get().board
      if (!b || !from || !to || from === to) return
      if (b.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return
      get().change((x) => ({ ...x, edges: [...x.edges, { id: uid(), from, to }] }))
      get().log('connected two cards')
    },

    pushToMap: (fromId, input, what) => {
      const b = get().board
      if (!b) return
      const maps = b.nodes.filter((n) => n.type === 'map')
      const linked = maps.find((m) => b.edges.some((e) => (e.from === fromId && e.to === m.id) || (e.to === fromId && e.from === m.id)))
      const target = linked ?? maps[0]
      if (target) {
        get().updateNode(target.id, (n) => ({ ...n, input }))
      } else {
        const src = b.nodes.find((n) => n.id === fromId)
        const id = get().addNode('map', { x: (src?.x ?? 0) + 240, y: (src?.y ?? 0) - 360 })
        get().updateNode(id, (n) => ({ ...n, input }), 'silent')
      }
      get().log(`showed ${what} on the map`)
    },

    drawNames: (id) => {
      const n = get().board?.splitN ?? 0
      get().updateNode(id, (x) => (x.type === 'santa' ? { ...x, pairs: drawNames(n), revealed: [] } : x))
      get().log('drew Secret Santa names')
    },

    applyTemplate: (key, name) => {
      const b = get().board
      if (!b) return
      get().change(() => fromTemplate(key, b))
      set({ dialog: null, sel: null, sizes: {}, mode: 'board' })
      get().log(`started from the ${name} template`)
      // Cards are measured on the next frames; fit once they are.
      setTimeout(() => get().fit(), 80)
    },

    set: (patch) => set(patch),
    togglePanel: (panel) => set({ panel: get().panel === panel ? null : panel, addOpen: false }),
    toggleDialog: (dialog) => set({ dialog: get().dialog === dialog ? null : dialog, addOpen: false }),
    setMode: (mode) => {
      set({ mode, addOpen: false, connectFrom: null, tool: get().tool === 'connect' ? 'select' : get().tool })
      try {
        localStorage.setItem(MODE_KEY, mode)
      } catch {
        // Not remembered; nothing else depends on it.
      }
    },
    setTool: (tool) => set({ tool, connectFrom: null, addOpen: false, mode: 'board' }),
    select: (sel) => set({ sel }),
    setView: (view) => set({ view }),

    zoomBy: (factor) => {
      const { view, viewport } = get()
      set({ view: zoomAt(view, clampZoom(view.z * factor), viewport.w / 2, viewport.h / 2) })
    },

    fit: () => {
      const { board, sizes, viewport, vw } = get()
      if (!board) return
      const mob = isMobileWidth(vw)
      const v = fitView(
        board.nodes.map((n) => nodeBox(n, sizes)),
        viewport.w,
        viewport.h,
        mob ? { side: 16, top: 120, bottom: 90 } : { side: 40, top: 80, bottom: 100 },
      )
      if (v) set({ view: v })
    },

    focusNode: (id) => {
      const { board, sizes, viewport, vw, view, panel } = get()
      const n = board?.nodes.find((x) => x.id === id)
      if (!n) return
      const b = nodeBox(n, sizes)
      const mob = isMobileWidth(vw)
      const z = Math.max(view.z, 0.9)
      const cw = mob ? viewport.w : viewport.w - 380
      set({
        mode: 'board',
        sel: { nodes: [id] },
        view: { z, x: cw / 2 - (b.x + b.w / 2) * z, y: (mob ? viewport.h * 0.3 : viewport.h / 2) - (b.y + b.h / 2) * z },
        panel: mob ? null : panel,
      })
    },

    setSize: (id, w, h) => {
      const s = get().sizes[id]
      if (s && s.w === w && s.h === h) return
      set({ sizes: { ...get().sizes, [id]: { w, h } } })
    },
  }
})

/** Typed access to one card for the card components. */
export function useNode<T extends NodeType>(id: string, _type: T) {
  return useBoard((s) => s.board?.nodes.find((n) => n.id === id)) as Extract<Node, { type: T }> | undefined
}

/** Updates one card of a known type. */
export function patchNode<T extends NodeType>(
  id: string,
  fn: (n: Extract<Node, { type: T }>) => Extract<Node, { type: T }>,
  mode: ChangeMode = 'step',
) {
  useBoard.getState().updateNode(id, (n) => fn(n as Extract<Node, { type: T }>), mode)
}

/** Updates one row (`items`, `stops`, `options`) of a card. */
export function patchRow<R extends { id: string }>(
  nodeId: string,
  key: 'items' | 'stops' | 'options',
  rowId: string,
  patch: Partial<R>,
  mode: ChangeMode = 'step',
) {
  useBoard.getState().updateNode(
    nodeId,
    (n) => {
      const rows = (n as unknown as Record<string, R[]>)[key]
      if (!rows) return n
      return { ...n, [key]: rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) } as Node
    },
    mode,
  )
}

export function addRow<R extends { id: string }>(nodeId: string, key: 'items' | 'stops' | 'options', row: R) {
  useBoard.getState().updateNode(nodeId, (n) => {
    const rows = (n as unknown as Record<string, R[]>)[key] ?? []
    return { ...n, [key]: [...rows, row] } as Node
  })
}

export function removeRow(nodeId: string, key: 'items' | 'stops' | 'options', rowId: string) {
  useBoard.getState().updateNode(nodeId, (n) => {
    const rows = (n as unknown as Record<string, Array<{ id: string }>>)[key] ?? []
    return { ...n, [key]: rows.filter((r) => r.id !== rowId) } as Node
  })
}
