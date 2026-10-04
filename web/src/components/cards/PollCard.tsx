import type { ChangeMode } from '~/store/board'
import { Check, Plus } from '@phosphor-icons/react'
import type { PollOption } from '~/lib/model.gen'
import { ME } from '~/lib/catalog'
import { newItem } from '~/lib/templates'
import { addRow, patchRow, useBoard, useNode } from '~/store/board'
import { Field, cx } from '../ui'

export function PollCard({ id }: { id: string }) {
  const n = useNode(id, 'poll')
  if (!n) return null
  const total = n.options.reduce((a, o) => a + o.votes.length, 0)
  const max = Math.max(1, ...n.options.map((o) => o.votes.length))
  const row = (o: PollOption, patch: Partial<PollOption>, mode?: ChangeMode) => patchRow(id, 'options', o.id, patch, mode)

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-3">
      {n.options.map((o) => {
        const on = o.votes.includes(ME)
        const lead = o.votes.length === max && total > 0
        return (
          <div key={o.id} className="relative flex min-h-9 items-center gap-2 overflow-hidden rounded-lg bg-bg px-2.5">
            <span
              className={cx('absolute inset-y-0 left-0 transition-[width] duration-300', lead ? 'bg-accent-800' : 'bg-neutral-800')}
              style={{ width: `${total ? (o.votes.length / total) * 100 : 0}%` }}
            />
            <button
              type="button"
              aria-pressed={on}
              aria-label={`Vote for ${o.text}`}
              onClick={() => {
                row(o, { votes: on ? o.votes.filter((v) => v !== ME) : [...o.votes, ME] })
                if (!on) useBoard.getState().log(`voted for ${o.text}`)
              }}
              className={cx(
                'relative grid size-[18px] flex-none place-items-center rounded-full p-0',
                on ? 'bg-accent text-bg' : 'border-[1.5px] border-neutral-600 text-transparent',
              )}
            >
              <Check size={10} />
            </button>
            <Field value={o.text} onValue={(text, m) => row(o, { text }, m)} className="relative flex-1 text-[13px]" />
            <span className="relative text-xs text-neutral-400">{o.votes.length}</span>
          </div>
        )
      })}
      <div className="flex items-center gap-2 text-[11px] text-neutral-500">
        {total} vote{total === 1 ? '' : 's'}
        <button type="button" onClick={() => addRow(id, 'options', newItem.option())} className="btn btn-ghost ml-auto text-xs">
          <Plus />
          Option
        </button>
      </div>
    </div>
  )
}
