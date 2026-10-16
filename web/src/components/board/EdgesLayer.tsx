import { useMemo, useRef } from 'react'
import { edgePath } from '~/lib/geometry'
import { nodeBox, useBoard } from '~/store/board'
import { useOverlay } from './interaction'

/** Connections between cards, drawn in board space under them. */
export function EdgesLayer() {
  const nodes = useBoard((s) => s.board?.nodes)
  const edges = useBoard((s) => s.board?.edges)
  const sizes = useBoard((s) => s.sizes)
  const sel = useBoard((s) => s.sel)
  const temp = useOverlay((s) => s.temp)

  const byId = useMemo(() => new Map((nodes ?? []).map((n) => [n.id, n])), [nodes])
  const select = useBoard.getState().select

  // Connections made after the board opened draw themselves in.
  const firstSeen = useRef<Map<string, number> | null>(null)
  const now = Date.now()
  if (!firstSeen.current) firstSeen.current = new Map((edges ?? []).map((e) => [e.id, 0]))
  const fresh = (id: string) => {
    const seen = firstSeen.current!
    if (!seen.has(id)) seen.set(id, now)
    return now - seen.get(id)! < 450
  }

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

      {edges?.map((e) => {
        const a = byId.get(e.from)
        const b = byId.get(e.to)
        if (!a || !b) return null
        const d = edgePath(nodeBox(a, sizes), nodeBox(b, sizes))
        const on = sel != null && 'edge' in sel && sel.edge === e.id
        const drawIn = !on && fresh(e.id)
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
                if (ev.button !== 0 || useBoard.getState().tool !== 'select') return
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
              pathLength={drawIn ? 1 : undefined}
              className={on ? 'animate-flow' : drawIn ? 'anim-draw' : 'transition-[stroke,stroke-width] duration-200'}
            />
          </g>
        )
      })}

      {tempPath && <path d={tempPath} stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="6 4" fill="none" markerEnd="url(#ip-arrow)" />}
    </svg>
  )
}
