import { cardColor } from '~/lib/catalog'
import { NamedIcon } from '~/lib/icons'
import { useBoard, useNode } from '~/store/board'
import { Field, cx } from '../ui'
import { CommentBadge } from './Comments'

/** Edge strips that pick the frame up; its interior lets presses through to the board. */
const EDGES = ['inset-x-0 top-0 h-2.5', 'inset-x-0 bottom-0 h-2.5', 'inset-y-0 left-0 w-2.5', 'inset-y-0 right-0 w-2.5'] as const

/**
 * A titled area behind the cards. Its label and border select and drag it
 * (with everything inside); the corner handle resizes it.
 */
export function FrameCard({ id, selected }: { id: string; selected: boolean }) {
  const n = useNode(id, 'frame')
  const grab = useBoard((s) => s.tool === 'select')
  if (!n) return null
  const line = selected ? 'var(--color-accent)' : n.color ? cardColor(n.color).border : 'var(--color-neutral-600)'
  const tint = n.color ? cardColor(n.color).border : 'var(--color-neutral-400)'

  return (
    <>
      <div
        className="absolute inset-0 rounded-[18px] border-[1.5px] transition-[border-color,box-shadow]"
        style={{
          borderColor: line,
          borderStyle: selected ? 'solid' : 'dashed',
          background: `color-mix(in srgb, ${tint} 6%, transparent)`,
          boxShadow: selected ? '0 0 24px color-mix(in srgb, var(--color-accent) 22%, transparent)' : undefined,
        }}
      />
      {EDGES.map((c) => (
        <div key={c} className={cx('pointer-events-auto absolute', c, grab && 'cursor-grab')} />
      ))}
      <div
        className={cx(
          'pointer-events-auto absolute top-2.5 left-2.5 flex max-w-[calc(100%-20px)] items-center gap-1.5 rounded-[10px] py-1 pr-1.5 pl-2',
          grab && 'cursor-grab',
        )}
        style={{
          background: `color-mix(in srgb, ${tint} 14%, var(--color-bg))`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${line} 50%, transparent)`,
        }}
      >
        <NamedIcon name={n.icon} className="flex-none text-[15px] text-neutral-300" />
        <Field
          value={n.title}
          onValue={(t, m) => useBoard.getState().updateNode(id, (x) => ({ ...x, title: t }), m)}
          size={Math.max(6, n.title.length + 1)}
          placeholder="Frame"
          aria-label="Frame title"
          className="text-sm font-medium text-neutral-100"
        />
        <CommentBadge id={id} />
      </div>
      <div
        data-resize={id}
        title="Drag to resize"
        className="pointer-events-auto absolute -right-1 -bottom-1 grid size-6 cursor-nwse-resize touch-none place-items-center"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="transition-opacity" style={{ opacity: selected ? 1 : 0.6 }}>
          <path d="M11 3 L3 11 M11 7 L7 11" stroke={line} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
    </>
  )
}
