import { useRef, useState } from 'react'
import { ChatCircle, PaperPlaneRight } from '@phosphor-icons/react'
import { useShallow } from 'zustand/react/shallow'
import { initials } from '~/lib/catalog'
import { timeAgo } from '~/lib/dates'
import { useBoard } from '~/store/board'
import { Popover } from '../chrome/Popover'
import { Avatar, RemoveButton, cx } from '../ui'

/**
 * A card's comment count (hidden while there are none) and its thread,
 * which opens from here or from the selection bar.
 */
export function CommentBadge({ id, className }: { id: string; className?: string }) {
  const count = useBoard((s) => s.board?.nodes.find((n) => n.id === id)?.comments.length ?? 0)
  const open = useBoard((s) => s.thread === id)
  // On the board the thread keeps its screen size whatever the zoom.
  const z = useBoard((s) => (s.mode === 'board' ? s.view.z : 1))
  const ref = useRef<HTMLButtonElement>(null)
  if (!count && !open) return null
  const set = useBoard.getState().set

  return (
    <span className={cx('relative flex-none', className)}>
      <button
        ref={ref}
        type="button"
        title={count === 1 ? '1 comment' : `${count} comments`}
        aria-pressed={open}
        onClick={() => set({ thread: open ? null : id })}
        className={cx(
          'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] transition-colors',
          open ? 'bg-accent-700 text-accent-100' : 'bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)] text-neutral-300 hover:text-text',
        )}
      >
        <ChatCircle weight={count ? 'fill' : 'regular'} />
        {count > 0 && count}
      </button>
      {open && (
        <div data-no-drag className="absolute top-full right-0 w-72 cursor-auto" style={{ scale: String(1 / z), transformOrigin: 'top right' }}>
          <Popover open onClose={() => set({ thread: null })} anchor={ref} className="top-1.5 right-0 w-72">
            <CommentThread id={id} />
          </Popover>
        </div>
      )}
    </span>
  )
}

/** The comments on one card, oldest first, with a box to add one. */
export function CommentThread({ id }: { id: string }) {
  const comments = useBoard(useShallow((s) => s.board?.nodes.find((n) => n.id === id)?.comments ?? []))
  const people = useBoard((s) => s.board?.people)
  const me = useBoard((s) => s.board?.people[s.me]?.name ?? 'You')
  const [text, setText] = useState('')
  const { addComment, deleteComment } = useBoard.getState()
  const send = () => {
    if (!text.trim()) return
    addComment(id, text)
    setText('')
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="kicker">Comments</div>
      {comments.length ? (
        <ul data-wheel className="m-0 -mr-1.5 flex max-h-64 list-none flex-col gap-3 overflow-y-auto p-0 pr-1.5">
          {comments.map((c) => (
            <li key={c.id} className="group flex gap-2">
              <Avatar ini={people?.find((p) => p.name === c.who)?.ini ?? initials(c.who)} className="mt-0.5 size-6 bg-accent-800 text-accent-100" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 text-xs">
                  <span className="truncate font-medium text-neutral-200">{c.who}</span>
                  <span className="flex-none text-neutral-600">{timeAgo(c.t)}</span>
                </div>
                <p className="m-0 text-[13px] leading-snug break-words whitespace-pre-wrap text-neutral-100">{c.text}</p>
              </div>
              <span className="opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                <RemoveButton label="Delete comment" onClick={() => deleteComment(id, c.id)} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-xs text-neutral-500">No comments yet.</p>
      )}
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={`Comment as ${me}…`}
          aria-label="Add a comment"
          className="input min-h-8 py-1 text-[13px]"
        />
        <button type="button" title="Send (Enter)" onClick={send} disabled={!text.trim()} className="btn btn-icon size-8 flex-none text-accent">
          <PaperPlaneRight />
        </button>
      </div>
    </div>
  )
}
