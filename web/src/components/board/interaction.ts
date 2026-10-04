import { create } from 'zustand'

/** The gesture in progress; mutated on every pointer move, so not React state. */
export type Drag =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { type: 'pinch'; d0: number; z0: number; wx: number; wy: number }
  | { type: 'node'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { type: 'port'; id: string; sx: number; sy: number; moved: boolean }
  | { type: 'pen' }

export const gesture: { drag: Drag | null; pointers: Map<number, { x: number; y: number }> } = {
  drag: null,
  pointers: new Map(),
}

/** Short-lived overlay drawn above the cards: a connection being dragged and a pen stroke. */
interface Overlay {
  temp: { from: string; x: number; y: number } | null
  drawing: Array<[number, number]> | null
  set(patch: Partial<Pick<Overlay, 'temp' | 'drawing'>>): void
}

export const useOverlay = create<Overlay>()((set) => ({
  temp: null,
  drawing: null,
  set: (patch) => set(patch),
}))
