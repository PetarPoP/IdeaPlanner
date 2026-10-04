import { smoothPath } from '~/lib/geometry'
import { useBoard } from '~/store/board'
import { useOverlay } from './interaction'

const color = (c: string) => c || 'var(--color-accent-300)'

/** Pen drawings, above the cards so ink drawn over a card stays visible. */
export function StrokesLayer() {
  const strokes = useBoard((s) => s.board?.strokes)
  const sel = useBoard((s) => s.sel)
  const tool = useBoard((s) => s.tool)
  const penColor = useBoard((s) => s.penColor)
  const drawing = useOverlay((s) => s.drawing)
  const select = useBoard.getState().select

  return (
    <svg className="pointer-events-none absolute top-0 left-0 z-[25] size-px overflow-visible">
      {strokes?.map((k) => {
        const d = smoothPath(k.pts)
        const on = sel != null && 'stroke' in sel && sel.stroke === k.id
        return (
          <g key={k.id} className="anim-fade">
            <path
              d={d}
              stroke="transparent"
              strokeWidth={12}
              fill="none"
              strokeLinecap="round"
              className="cursor-pointer"
              style={{ pointerEvents: tool === 'select' ? 'stroke' : 'none' }}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                select({ stroke: k.id })
              }}
            />
            <path
              d={d}
              stroke={color(k.color)}
              strokeWidth={on ? 3.5 : 2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={on ? { filter: 'drop-shadow(0 0 6px var(--color-accent))' } : undefined}
            />
          </g>
        )
      })}
      {drawing && drawing.length > 1 && (
        <path d={smoothPath(drawing)} stroke={color(penColor)} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}
