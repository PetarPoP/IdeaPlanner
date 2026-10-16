import { memo, useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Box } from '~/lib/geometry'
import type { Node } from '~/lib/model.gen'
import { cardColor } from '~/lib/catalog'
import { nodeBox, useBoard } from '~/store/board'

const W = 200
const H = 132

/** Smallest box around `boxes`, grown by `pad` on each side. */
function around(boxes: Box[], pad: number): Box {
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad
  const y0 = Math.min(...boxes.map((b) => b.y)) - pad
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const fill = (n: Node) =>
  n.type === 'sticky'
    ? cardColor(n.color || 'amber').border
    : n.color
      ? cardColor(n.color).border
      : n.accent
        ? 'var(--color-accent-600)'
        : 'var(--color-neutral-700)'

/** Every card as a block; frames as outlines under them. */
const Blocks = memo(function Blocks({ nodes, sizes }: { nodes: Node[]; sizes: Record<string, { w: number; h: number }> }) {
  const frames = nodes.filter((n) => n.type === 'frame')
  const cards = nodes.filter((n) => n.type !== 'frame')
  return (
    <>
      {frames.map((n) => {
        const b = nodeBox(n, sizes)
        return (
          <rect
            key={n.id}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={14}
            fill="none"
            stroke={n.color ? cardColor(n.color).border : 'var(--color-neutral-600)'}
            strokeWidth={1}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
      {cards.map((n) => {
        const b = nodeBox(n, sizes)
        return <rect key={n.id} x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={fill(n)} opacity={n.color || n.type === 'sticky' ? 0.75 : 1} />
      })}
    </>
  )
})

/** An overview of the whole board with the visible part outlined; press or drag on it to pan there. */
export function MiniMap() {
  const nodes = useBoard((s) => s.board?.nodes)
  const sizes = useBoard((s) => s.sizes)
  const view = useBoard((s) => s.view)
  const viewport = useBoard((s) => s.viewport)
  const ref = useRef<SVGSVGElement>(null)
  /** The extent shown when a drag began, kept still until it ends. */
  const frozen = useRef<Box | null>(null)

  const content = useMemo(
    () =>
      nodes?.length
        ? around(
            nodes.map((n) => nodeBox(n, sizes)),
            0,
          )
        : null,
    [nodes, sizes],
  )
  const seen = { x: -view.x / view.z, y: -view.y / view.z, w: viewport.w / view.z, h: viewport.h / view.z }
  const extent = frozen.current ?? around(content ? [content, seen] : [seen], 80)

  const panTo = (e: ReactPointerEvent) => {
    const m = ref.current?.getScreenCTM()
    if (!m) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    const s = useBoard.getState()
    s.setView({ z: s.view.z, x: s.viewport.w / 2 - p.x * s.view.z, y: s.viewport.h / 2 - p.y * s.view.z })
  }

  return (
    <div className="glass anim-fade absolute right-[18px] bottom-[70px] z-[41] overflow-hidden rounded-xl p-1 max-md:hidden">
      <svg
        ref={ref}
        width={W}
        height={H}
        viewBox={`${extent.x} ${extent.y} ${extent.w} ${extent.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Mini-map: press to move the view"
        className="block cursor-pointer touch-none"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          frozen.current = extent
          e.currentTarget.setPointerCapture(e.pointerId)
          panTo(e)
        }}
        onPointerMove={(e) => frozen.current && panTo(e)}
        onPointerUp={() => (frozen.current = null)}
        onPointerCancel={() => (frozen.current = null)}
      >
        {nodes && <Blocks nodes={nodes} sizes={sizes} />}
        <rect
          x={seen.x}
          y={seen.y}
          width={seen.w}
          height={seen.h}
          rx={6}
          fill="color-mix(in srgb, var(--color-accent) 12%, transparent)"
          stroke="var(--color-accent-400)"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
