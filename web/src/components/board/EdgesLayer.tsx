import { useMemo } from 'react'
import { edgePath } from '~/lib/geometry'
import { nodeBox, useBoard } from '~/store/board'
import { useOverlay } from './interaction'

const strokePath = (pts: ReadonlyArray<readonly [number, number]>) => `M${pts.map((p) => p.join(',')).join(' L')}`

/** Connections and pen strokes, drawn in board space under the cards. */
export function EdgesLayer() {
  const nodes = useBoard((s) => s.board?.nodes)
  const edges = useBoard((s) => s.board?.edges)
  const strokes = useBoard((s) => s.board?.strokes)
  const sizes = useBoard((s) => s.sizes)
  const sel = useBoard((s) => s.sel)
  const tool = useBoard((s) => s.tool)
  const temp = useOverlay((s) => s.temp)
  const drawing = useOverlay((s) => s.drawing)

  const byId = useMemo(() => new Map((nodes ?? []).map((n) => [n.id, n])), [nodes])
  const select = useBoard.getState().select

  const tempPath = (() => {
    const from = temp && byId.get(temp.from)
    if (!temp || !from) return null
    const a = nodeBox(from, sizes)
    const x1 = a.x + a.w
    const y1 = a.y + a.h / 2
    return `M${x1},${y1} C${x1 + 60},${y1} ${temp.x - 60},${temp.y} ${temp.x},${temp.y}`
  })()

  return (
    <svg className="pointer-events-none absolute top-0 left-0 z-[1] size-px overflow-visible">
      <defs>
        <marker id="ip-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-accent-400)" />
        </marker>
      </defs>

      {strokes?.map((k) => {
        const d = strokePath(k.pts)
        const on = sel != null && 'stroke' in sel && sel.stroke === k.id
        return (
          <g key={k.id}>
            <path
              d={d}
              stroke="transparent"
              strokeWidth={14}
              fill="none"
              className="cursor-pointer"
              style={{ pointerEvents: tool === 'select' ? 'stroke' : 'none' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                select({ stroke: k.id })
              }}
            />
            <path
              d={d}
              stroke={on ? 'var(--color-accent)' : 'var(--color-accent-300)'}
              strokeWidth={on ? 3.5 : 2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={on ? { filter: 'drop-shadow(0 0 6px var(--color-accent))' } : undefined}
            />
          </g>
        )
      })}

      {edges?.map((e) => {
        const a = byId.get(e.from)
        const b = byId.get(e.to)
        if (!a || !b) return null
        const d = edgePath(nodeBox(a, sizes), nodeBox(b, sizes))
        const on = sel != null && 'edge' in sel && sel.edge === e.id
        return (
          <g key={e.id}>
            <path
              d={d}
              stroke="transparent"
              strokeWidth={16}
              fill="none"
              className="cursor-pointer"
              style={{ pointerEvents: 'stroke' }}
              onPointerDown={(ev) => {
                ev.stopPropagation()
                select({ edge: e.id })
              }}
            />
            <path
              d={d}
              fill="none"
              stroke={on ? 'var(--color-accent-300)' : 'var(--color-accent-600)'}
              strokeWidth={on ? 2.5 : 1.75}
              markerEnd="url(#ip-arrow)"
              strokeDasharray={on ? '6 4' : undefined}
              className={on ? 'animate-flow' : undefined}
            />
          </g>
        )
      })}

      {tempPath && <path d={tempPath} stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="6 4" fill="none" markerEnd="url(#ip-arrow)" />}
      {drawing && drawing.length > 1 && (
        <path d={strokePath(drawing)} stroke="var(--color-accent-300)" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}
