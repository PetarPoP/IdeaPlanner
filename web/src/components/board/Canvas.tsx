import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { clampZoom, simplify, snap, zoomAt } from '~/lib/geometry'
import { uid } from '~/lib/ids'
import { nodeBox, selectedNodes, useBoard } from '~/store/board'
import { EdgesLayer } from './EdgesLayer'
import { NodeCard } from './NodeCard'
import { StrokesLayer } from './StrokesLayer'
import { gesture, isInteractive, useOverlay } from './interaction'

const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="rgba(145,132,217,.18)" stroke="#d2cefd" stroke-width="1.5"/></svg>',
)}") 12 12, cell`
const CURSOR = { select: 'default', hand: 'grab', pen: 'crosshair', erase: ERASER_CURSOR, connect: 'crosshair' } as const

/** Eraser reach, in screen pixels. */
const ERASER_PX = 12
/** How far a press may wander before it counts as a drag. */
const DRAG_SLOP = 4

/** A text field that isn't being edited yet: pressing it may still drag its card. */
const isIdleTextField = (t: EventTarget | null): t is HTMLInputElement | HTMLTextAreaElement =>
  (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && (t.type === 'text' || t.type === 'search' || t.type === ''))) &&
  t !== document.activeElement

/** The infinite board: pan, pinch/wheel zoom, card drags, selection box, connections and drawing. */
export function Canvas() {
  const ref = useRef<HTMLDivElement>(null)
  const ids = useBoard(useShallow((s) => s.board?.nodes.map((n) => n.id) ?? []))
  const view = useBoard((s) => s.view)
  const tool = useBoard((s) => s.tool)
  const marquee = useOverlay((s) => s.marquee)

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect()
    const v = useBoard.getState().view
    return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }
  }, [])

  const startPan = useCallback((e: { clientX: number; clientY: number }) => {
    const v = useBoard.getState().view
    gesture.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y }
  }, [])

  /** Erases drawings under the pointer; the first hit opens one undo step for the whole gesture. */
  const erase = useCallback(
    (d: { stepped: boolean }, cx: number, cy: number) => {
      const s = useBoard.getState()
      const before = s.board
      const p = toWorld(cx, cy)
      if (before && s.eraseAt(p.x, p.y, ERASER_PX / s.view.z) && !d.stepped) {
        d.stepped = true
        useBoard.setState({ past: [...s.past.slice(-39), before], future: [] })
      }
    },
    [toWorld],
  )

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
      if (ref.current) gesture.world = toWorld(e.clientX, e.clientY)
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
        case 'nodes': {
          if (!d.moved) {
            if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_SLOP) return
            d.moved = true
            // A press on a text field became a drag: don't leave it focused or selecting.
            if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-node-id]')) document.activeElement.blur()
            window.getSelection()?.removeAllRanges()
            useOverlay.getState().set({ dragging: true })
            // One undo step for the whole drag.
            s.change((b) => ({ ...b }), 'step')
          }
          const dx = (e.clientX - d.sx) / s.view.z
          const dy = (e.clientY - d.sy) / s.view.z
          s.change(
            (b) => ({
              ...b,
              nodes: b.nodes.map((n) => {
                const o = d.from.get(n.id)
                if (!o) return n
                const x = snap(o.x + dx)
                const y = snap(o.y + dy)
                return n.x === x && n.y === y ? n : { ...n, x, y }
              }),
            }),
            'silent',
          )
          break
        }
        case 'port': {
          d.moved ||= Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5
          const p = toWorld(e.clientX, e.clientY)
          useOverlay.getState().set({ temp: { from: d.id, x: p.x, y: p.y } })
          break
        }
        case 'marquee': {
          const a = toWorld(d.sx, d.sy)
          const b = toWorld(e.clientX, e.clientY)
          const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
          useOverlay.getState().set({ marquee: box })
          const hits = (s.board?.nodes ?? [])
            .filter((n) => {
              const r = nodeBox(n, s.sizes)
              return r.x < box.x + box.w && r.x + r.w > box.x && r.y < box.y + box.h && r.y + r.h > box.y
            })
            .map((n) => n.id)
          const next = d.additive ? [...new Set([...d.base, ...hits])] : hits
          const cur = selectedNodes(s.sel)
          if (next.length !== cur.length || next.some((id, i) => id !== cur[i])) s.set({ sel: next.length ? { nodes: next } : null })
          break
        }
        case 'pen': {
          const p = toWorld(e.clientX, e.clientY)
          const { drawing, set } = useOverlay.getState()
          const last = drawing?.[drawing.length - 1]
          if (last && Math.hypot(last[0] - p.x, last[1] - p.y) < 1.5 / s.view.z) return
          set({ drawing: [...(drawing ?? []), [p.x, p.y]] })
          break
        }
        case 'erase':
          erase(d, e.clientX, e.clientY)
          break
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
      if (d.type === 'nodes') {
        // A click (no move) on one card of a group selects just that card.
        if (!d.moved && !d.additive && selectedNodes(s.sel).length > 1) s.set({ sel: { nodes: [d.clicked] } })
        if (d.moved && d.from.size > 1) s.log(`moved ${d.from.size} cards`)
        useOverlay.getState().set({ dragging: false })
      }
      if (d.type === 'port') {
        if (d.moved) {
          const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node-id]')
          const to = target?.getAttribute('data-node-id')
          if (to) s.addEdge(d.id, to)
        } else {
          // A tap on the port starts a two-tap connection instead.
          s.set({ tool: 'connect', connectFrom: d.id, sel: { nodes: [d.id] } })
        }
        useOverlay.getState().set({ temp: null })
      }
      if (d.type === 'marquee') {
        const box = useOverlay.getState().marquee
        if (!box && !d.additive) s.set({ sel: null })
        useOverlay.getState().set({ marquee: null })
      }
      if (d.type === 'pen') {
        const pts = useOverlay.getState().drawing
        if (pts && pts.length > 1) {
          const kept = simplify(pts, 0.8 / s.view.z).map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number])
          s.change((b) => ({ ...b, strokes: [...b.strokes, { id: uid(), pts: kept, color: s.penColor }] }))
        }
        useOverlay.getState().set({ drawing: null })
      }
      if (d.type === 'erase' && d.stepped) s.log('erased a drawing')
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
  }, [toWorld, erase])

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

  const onDown = (e: ReactPointerEvent) => {
    const s = useBoard.getState()
    gesture.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.world = toWorld(e.clientX, e.clientY)
    if (s.addOpen) s.set({ addOpen: false })

    // A second finger turns whatever started into a pinch.
    if (gesture.pointers.size === 2 && e.pointerType === 'touch') {
      const [a, b] = [...gesture.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
      const r = ref.current!.getBoundingClientRect()
      const v = s.view
      const mx = (a.x + b.x) / 2 - r.left
      const my = (a.y + b.y) / 2 - r.top
      if (gesture.drag?.type === 'nodes' && gesture.drag.moved) s.undo()
      gesture.drag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: v.z, wx: (mx - v.x) / v.z, wy: (my - v.y) / v.z }
      useOverlay.getState().set({ drawing: null, marquee: null, dragging: false })
      return
    }

    // Middle button, space+drag and the hand tool pan from anywhere.
    if (e.button === 1 || gesture.space || s.tool === 'hand') {
      e.preventDefault()
      startPan(e)
      return
    }
    if (e.button !== 0) return

    if (s.tool === 'pen') {
      const p = toWorld(e.clientX, e.clientY)
      gesture.drag = { type: 'pen' }
      useOverlay.getState().set({ drawing: [[p.x, p.y]] })
      return
    }
    if (s.tool === 'erase') {
      const d = { type: 'erase' as const, stepped: false }
      gesture.drag = d
      erase(d, e.clientX, e.clientY)
      return
    }

    const target = e.target as Element
    const port = target.closest('[data-port]')?.getAttribute('data-port')
    const cardId = target.closest('[data-node-id]')?.getAttribute('data-node-id')

    if (port) {
      gesture.drag = { type: 'port', id: port, sx: e.clientX, sy: e.clientY, moved: false }
      return
    }

    if (s.tool === 'connect') {
      if (!cardId) {
        s.set({ connectFrom: null })
        startPan(e)
      } else if (!s.connectFrom) s.set({ connectFrom: cardId, sel: { nodes: [cardId] } })
      else if (s.connectFrom !== cardId) {
        s.addEdge(s.connectFrom, cardId)
        s.set({ connectFrom: null })
      }
      return
    }

    if (cardId) {
      const additive = e.shiftKey || e.metaKey || e.ctrlKey
      const current = selectedNodes(s.sel)
      const selected = current.includes(cardId)
      const textField = isIdleTextField(target)
      // Buttons, links, pickers and fields being edited keep their own behaviour.
      if (!textField && isInteractive(target)) {
        if (!selected && !additive) s.set({ sel: { nodes: [cardId] } })
        return
      }
      if (!textField) {
        // Keeps the press from selecting text; that also skips the usual blur, so do it here.
        e.preventDefault()
        if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-canvas]')) document.activeElement.blur()
      }
      let next = current
      if (additive) {
        next = selected ? current.filter((id) => id !== cardId) : [...current, cardId]
        s.set({ sel: next.length ? { nodes: next } : null })
        if (selected) return
      } else if (!selected) {
        next = [cardId]
        s.set({ sel: { nodes: next } })
      }
      const nodes = s.board?.nodes ?? []
      const from = new Map(nodes.filter((n) => next.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]))
      gesture.drag = { type: 'nodes', from, sx: e.clientX, sy: e.clientY, moved: false, clicked: cardId, additive }
      return
    }

    // Empty board: a mouse draws a selection box, a finger pans.
    if (e.pointerType === 'touch') {
      startPan(e)
      if (s.sel) s.set({ sel: null })
      return
    }
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    if (!additive && s.sel && !('nodes' in s.sel)) s.set({ sel: null })
    gesture.drag = { type: 'marquee', sx: e.clientX, sy: e.clientY, additive, base: additive ? selectedNodes(s.sel) : [] }
  }

  const onBackgroundDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-node-id]') || useBoard.getState().tool !== 'select') return
    const p = toWorld(e.clientX, e.clientY)
    useBoard.getState().addNode('note', { x: p.x, y: p.y + 60 })
  }

  const grid = 24 * view.z
  const drawing = tool === 'pen' || tool === 'erase'
  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      // Stops the browser's middle-click autoscroll.
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onAuxClick={(e) => e.button === 1 && e.preventDefault()}
      onDoubleClick={onBackgroundDoubleClick}
      data-canvas
      className="absolute inset-0 touch-none select-none"
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
          <NodeCard key={id} id={id} />
        ))}
        <StrokesLayer />
        {marquee && (
          <div
            className="pointer-events-none absolute z-40 rounded-[3px] border border-accent bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, borderWidth: 1 / view.z }}
          />
        )}
      </div>
      {/* While drawing, a sheet over the cards takes every press. */}
      {drawing && <div className="absolute inset-0 z-30" />}
    </div>
  )
}
