import { create } from 'zustand'

/** The gesture in progress; mutated on every pointer move, so not React state. */
export type Drag =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { type: 'pinch'; d0: number; z0: number; wx: number; wy: number }
  | {
      type: 'nodes'
      /** Card origins at the start of the drag. */
      from: Map<string, { x: number; y: number }>
      sx: number
      sy: number
      moved: boolean
      /** Card under the pointer, to select alone on a click without a move. */
      clicked: string
      additive: boolean
    }
  | { type: 'port'; id: string; sx: number; sy: number; moved: boolean }
  | { type: 'marquee'; sx: number; sy: number; additive: boolean; base: string[] }
  | { type: 'pen' }
  | { type: 'erase'; stepped: boolean }

export const gesture: {
  drag: Drag | null
  pointers: Map<number, { x: number; y: number }>
  /** Last pointer position on the board, in board units (where pastes land). */
  world: { x: number; y: number } | null
  /** Space is held: drags pan whatever the tool. */
  space: boolean
} = {
  drag: null,
  pointers: new Map(),
  world: null,
  space: false,
}

/** Short-lived overlay state: a connection being dragged, a pen stroke, the selection box. */
interface Overlay {
  temp: { from: string; x: number; y: number } | null
  drawing: Array<[number, number]> | null
  /** Selection box in board units. */
  marquee: { x: number; y: number; w: number; h: number } | null
  /** Cards being dragged, for the lifted look. */
  dragging: boolean
  set(patch: Partial<Omit<Overlay, 'set'>>): void
}

export const useOverlay = create<Overlay>()((set) => ({
  temp: null,
  drawing: null,
  marquee: null,
  dragging: false,
  set: (patch) => set(patch),
}))

/** Elements inside a card that keep their own pointer behaviour instead of dragging it. */
export const INTERACTIVE = 'input, textarea, select, button, a, iframe, label, [role="button"], [contenteditable="true"], [data-no-drag]'

export const isInteractive = (t: EventTarget | null) => t instanceof Element && t.closest(INTERACTIVE) != null
