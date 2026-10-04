import { ThumbsUp } from '@phosphor-icons/react'
import { ME } from '~/lib/catalog'
import { patchNode, useNode } from '~/store/board'
import { Area, cx } from '../ui'

export function NoteCard({ id }: { id: string }) {
  const n = useNode(id, 'note')
  if (!n) return null
  const voted = n.votes.includes(ME)

  return (
    <div className="flex flex-col gap-2.5 px-3 pb-3">
      <Area
        value={n.text}
        onValue={(text, m) => patchNode<'note'>(id, (x) => ({ ...x, text }), m)}
        rows={4}
        placeholder="Write an idea…"
        className="text-sm leading-normal text-neutral-100"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={voted}
          onClick={() => patchNode<'note'>(id, (x) => ({ ...x, votes: voted ? x.votes.filter((v) => v !== ME) : [...x.votes, ME] }))}
          className={cx(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
            voted ? 'bg-accent-700 text-accent-100' : 'bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)] text-neutral-300',
          )}
        >
          <ThumbsUp weight={voted ? 'fill' : 'regular'} />
          {n.votes.length}
        </button>
        <span className="text-[11px] text-neutral-500">by {n.author}</span>
      </div>
    </div>
  )
}
