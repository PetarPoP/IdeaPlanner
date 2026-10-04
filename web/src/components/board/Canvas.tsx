import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { clampZoom, snap, zoomAt } from '~/lib/geometry'
import { uid } from '~/lib/ids'
import { useBoard } from '~/store/board'
import { EdgesLayer } from './EdgesLayer'
import { NodeCard } from './NodeCard'
import { gesture, useOverlay } from './interaction'

const CURSOR = { select: 'default', hand: 'grab', pen: 'crosshair', connect: 'crosshair' } as const
const isOnCard = (t: EventTarget | null) => t instanceof Element && t.closest('[data-node-id]') != null

/** The infinite board: pan, pinch/wheel zoom, card drags, connections and pen strokes. */
export function Canvas() {
  const ref = useRef<HTMLDivElement>(null)
  const ids = useBoard(useShallow((s) => s.board?.nodes.map((n) => n.id) ?? []))
  const view = useBoard((s) => s.view)
  const tool = useBoard((s) => s.tool)

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect()
    const v = useBoard.getState().view
    return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }
  }, [])

  const startPan = useCallback((e: { clientX: number; clientY: number }) => {
    const v = useBoard.getState().view
    gesture.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y }
  }, [])

  // Viewport size, for centring new cards and fitting.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => useBoard.getState().set({ viewport: { w: el.clientWidth, h: el.clientHeight } }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Pointer moves and releases are tracked on the window so drags survive
  // leaving the card or the board.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (gesture.pointers.has(e.pointerId)) gesture.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const d = gesture.drag
      if (!d) return
      const s = useBoard.getState()
      switch (d.type) {
        case 'pan':
          s.setView({ ...s.view, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy })
          break
        case 'pinch': {
          if (gesture.pointers.size < 2) return
          const [a, b] = [...gesture.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
          const r = ref.current!.getBoundingClientRect()
          const z = clampZoom((d.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / d.d0)
          const mx = (a.x + b.x) / 2 - r.left
          const my = (a.y + b.y) / 2 - r.top
          s.setView({ z, x: mx - d.wx * z, y: my - d.wy * z })
          break
        }
        case 'node': {
          if (!d.moved) {
            if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return
            d.moved = true
            // One undo step for the whole drag.
            s.change((b) => ({ ...b }), 'step')
          }
          const x = snap(d.ox + (e.clientX - d.sx) / s.view.z)
          const y = snap(d.oy + (e.clientY - d.sy) / s.view.z)
          s.updateNode(d.id, (n) => (n.x === x && n.y === y ? n : { ...n, x, y }), 'silent')
          break
        }
        case 'port': {
          d.moved ||= Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5
          const p = toWorld(e.clientX, e.clientY)
          useOverlay.getState().set({ temp: { from: d.id, x: p.x, y: p.y } })
          break
        }
        case 'pen': {
          const p = toWorld(e.clientX, e.clientY)
          const { drawing, set } = useOverlay.getState()
          const last = drawing?.[drawing.length - 1]
          if (last && Math.hypot(last[0] - p.x, last[1] - p.y) < 2 / s.view.z) return
          set({ drawing: [...(drawing ?? []), [p.x, p.y]] })
          break
        }
      }
    }

    const onUp = (e: PointerEvent) => {
      gesture.pointers.delete(e.pointerId)
      const d = gesture.drag
      if (!d) return
      const s = useBoard.getState()
      if (d.type === 'pinch') {
        if (gesture.pointers.size < 2) gesture.drag = null
        return
      }
      if (d.type === 'port') {
        if (d.moved) {
          const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node-id]')
          const to = target?.getAttribute('data-node-id')
          if (to) s.addEdge(d.id, to)
        } else {
          // A tap on the port starts a two-tap connection instead.
          s.set({ tool: 'connect', connectFrom: d.id, sel: { node: d.id } })
        }
        useOverlay.getState().set({ temp: null })
      }
      if (d.type === 'pen') {
        const pts = useOverlay.getState().drawing
        if (pts && pts.length > 1) {
          const rounded = pts.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number])
          s.change((b) => ({ ...b, strokes: [...b.strokes, { id: uid(), pts: rounded }] }))
        }
        useOverlay.getState().set({ drawing: null })
      }
      gesture.drag = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [toWorld])

  // React registers wheel listeners as passive; zooming needs preventDefault.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.target instanceof Element && e.target.closest('textarea, iframe')) return
      e.preventDefault()
      const s = useBoard.getState()
      const v = s.view
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        s.setView(zoomAt(v, v.z * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top))
      } else {
        s.setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (isOnCard(e.target)) return
    gesture.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const s = useBoard.getState()
    if (s.addOpen) s.set({ addOpen: false })

    if (gesture.pointers.size === 2) {
      const [a, b] = [...gesture.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
      const r = ref.current!.getBoundingClientRect()
      const v = s.view
      const mx = (a.x + b.x) / 2 - r.left
      const my = (a.y + b.y) / 2 - r.top
      gesture.drag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: v.z, wx: (mx - v.x) / v.z, wy: (my - v.y) / v.z }
      useOverlay.getState().set({ drawing: null })
      return
    }
    if (s.tool === 'pen') {
      const p = toWorld(e.clientX, e.clientY)
      gesture.drag = { type: 'pen' }
      useOverlay.getState().set({ drawing: [[p.x, p.y]] })
      return
    }
    startPan(e)
    if (s.tool === 'connect') s.set({ connectFrom: null })
    else if (s.sel) s.set({ sel: null })
  }

  const onBackgroundDoubleClick = (e: React.MouseEvent) => {
    if (isOnCard(e.target)) return
    const p = toWorld(e.clientX, e.clientY)
    useBoard.getState().addNode('note', { x: p.x, y: p.y + 60 })
  }

  const grid = 24 * view.z
  return (
    <div
      ref={ref}
      onPointerDown={onBackgroundDown}
      onDoubleClick={onBackgroundDoubleClick}
      className="absolute inset-0 touch-none"
      style={{
        cursor: CURSOR[tool],
        backgroundImage: 'radial-gradient(circle,#3f424d 1px,transparent 1.3px)',
        backgroundSize: `${grid}px ${grid}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.z})` }}>
        <EdgesLayer />
        {ids.map((id) => (
          <NodeCard key={id} id={id} startPan={startPan} />
        ))}
      </div>
    </div>
  )
}
