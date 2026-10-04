export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface View {
  x: number
  y: number
  z: number
}

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 2.5
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/** Zooms to `z` while keeping the screen point (mx, my) fixed. */
export function zoomAt(v: View, z: number, mx: number, my: number): View {
  const nz = clampZoom(z)
  return { z: nz, x: mx - ((mx - v.x) * nz) / v.z, y: my - ((my - v.y) * nz) / v.z }
}

/** A curved connector leaving A's facing side and entering B's. */
export function edgePath(a: Box, b: Box): string {
  const ax = a.x + a.w / 2
  const ay = a.y + a.h / 2
  const bx = b.x + b.w / 2
  const by = b.y + b.h / 2
  const dx = bx - ax
  const dy = by - ay
  if (Math.abs(dx) > Math.abs(dy) * 0.6) {
    const s = dx > 0 ? 1 : -1
    const p1 = [s > 0 ? a.x + a.w : a.x, ay] as const
    const p2 = [s > 0 ? b.x : b.x + b.w, by] as const
    const c = Math.max(40, Math.abs(p2[0] - p1[0]) / 2)
    return `M${p1[0]},${p1[1]} C${p1[0] + s * c},${p1[1]} ${p2[0] - s * c},${p2[1]} ${p2[0]},${p2[1]}`
  }
  const s = dy > 0 ? 1 : -1
  const p1 = [ax, s > 0 ? a.y + a.h : a.y] as const
  const p2 = [bx, s > 0 ? b.y : b.y + b.h] as const
  const c = Math.max(40, Math.abs(p2[1] - p1[1]) / 2)
  return `M${p1[0]},${p1[1]} C${p1[0]},${p1[1] + s * c} ${p2[0]},${p2[1] - s * c} ${p2[0]},${p2[1]}`
}

export interface Insets {
  side: number
  top: number
  bottom: number
}

/** The view that fits all boxes into a viewport of `w`×`h`, leaving room for the chrome. */
export function fitView(boxes: Box[], w: number, h: number, pad: Insets): View | null {
  if (!boxes.length) return null
  const x0 = Math.min(...boxes.map((b) => b.x))
  const y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.w))
  const y1 = Math.max(...boxes.map((b) => b.y + b.h))
  const availW = w - 2 * pad.side
  const availH = h - pad.top - pad.bottom
  const z = clampZoom(Math.min(availW / (x1 - x0 || 1), availH / (y1 - y0 || 1), 1.1))
  return {
    z,
    x: pad.side + (availW - (x1 - x0) * z) / 2 - x0 * z,
    y: pad.top + (availH - (y1 - y0) * z) / 2 - y0 * z,
  }
}

export const snap = (v: number, grid = 20) => Math.round(v / grid) * grid
