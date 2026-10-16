import { ArrowRight, Shuffle } from '@phosphor-icons/react'
import { patchNode, useBoard, useNode } from '~/store/board'
import { cx } from '../ui'
import { useBoardMeta } from './hooks'

export function SantaCard({ id }: { id: string }) {
  const n = useNode(id, 'santa')
  const { cur, splitN, people } = useBoardMeta()
  if (!n) return null
  // A draw made for a different group size is stale.
  const pairs = n.pairs && n.pairs.length === splitN ? n.pairs : null

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-3">
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span className="tag tag-accent">
          Cap {cur}
          {n.cap}
        </span>
        {splitN} people · {pairs ? 'tap to reveal' : 'not drawn yet'}
      </div>
      {people.slice(0, splitN).map((p, i) => {
        const shown = pairs != null && n.revealed.includes(i)
        const receiver = pairs?.[i]
        return (
          <div key={i} className="flex min-h-8 items-center gap-2 text-[13px]">
            <span className="grid size-6 flex-none place-items-center rounded-full bg-neutral-700 text-[10px]">{p.ini}</span>
            {p.name}
            <ArrowRight className="text-neutral-600" />
            <button
              type="button"
              disabled={!pairs}
              onClick={() =>
                patchNode<'santa'>(id, (x) => ({ ...x, revealed: shown ? x.revealed.filter((r) => r !== i) : [...x.revealed, i] }), 'silent')
              }
              className={cx(
                'ml-auto rounded-md px-2.5 py-[3px] text-xs disabled:cursor-default',
                shown ? 'bg-accent-800 text-accent-100' : 'border border-dashed border-neutral-700 text-neutral-400',
              )}
            >
              {!pairs ? '—' : shown && receiver != null ? people[receiver]?.name : 'Tap to reveal'}
            </button>
          </div>
        )
      })}
      <button type="button" className="btn btn-primary mt-1" onClick={() => useBoard.getState().drawNames(id)}>
        <Shuffle />
        {pairs ? 'Redraw names' : 'Draw names'}
      </button>
    </div>
  )
}
